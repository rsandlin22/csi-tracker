(() => {
  const balanceEl = document.getElementById('balance');
  const transactionListEl = document.getElementById('transactionList');
  const addButtons = document.getElementById('addButtons');
  const openSubtractBtn = document.getElementById('openSubtract');

  const modalOverlay = document.getElementById('modalOverlay');
  const modalAmountEl = document.getElementById('modalAmount');
  const stepperEl = document.getElementById('stepper');
  const stepDownBtn = document.getElementById('stepDown');
  const stepUpBtn = document.getElementById('stepUp');
  const customAmountInput = document.getElementById('customAmount');
  const noteInput = document.getElementById('noteInput');
  const quickNotesEl = document.getElementById('quickNotes');
  const modalErrorEl = document.getElementById('modalError');
  const cancelBtn = document.getElementById('cancelBtn');
  const confirmBtn = document.getElementById('confirmBtn');

  let state = { balance: 0, transactions: [], quickNotes: { credit: [], debit: [] } };
  let currentType = 'credit';
  let currentAmount = 0;

  const formatMoney = n => `$${Number(n).toFixed(2)}`;

  function render() {
    balanceEl.textContent = formatMoney(state.balance);

    if (!state.transactions.length) {
      transactionListEl.innerHTML = '<li class="empty-state">No transactions yet.</li>';
      return;
    }

    transactionListEl.innerHTML = state.transactions.map(tx => {
      const sign = tx.type === 'credit' ? '+' : '−';
      const date = new Date(tx.created_at).toLocaleString(undefined, {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
      });
      return `
        <li>
          <div class="tx-info">
            <span class="tx-note">${escapeHtml(tx.note)}</span>
            <span class="tx-date">${date}</span>
          </div>
          <span class="tx-amount ${tx.type}">${sign}${formatMoney(tx.amount)}</span>
        </li>
      `;
    }).join('');
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  async function loadState() {
    const res = await fetch('/api/state');
    if (!res.ok) throw new Error('Failed to load account state.');
    state = await res.json();
    render();
  }

  function renderQuickNotes() {
    const notes = state.quickNotes[currentType] || [];
    if (!notes.length) {
      quickNotesEl.innerHTML = '';
      return;
    }
    quickNotesEl.innerHTML = notes.map(n =>
      `<button type="button" class="quick-note-chip" data-note="${escapeHtml(n)}">${escapeHtml(n)}</button>`
    ).join('');
  }

  function updateModalAmountDisplay() {
    const sign = currentType === 'credit' ? '+' : '−';
    modalAmountEl.textContent = `${sign}${formatMoney(currentAmount)}`;
  }

  function openModal(type, amount) {
    currentType = type;
    currentAmount = amount;
    noteInput.value = '';
    modalErrorEl.hidden = true;

    stepperEl.hidden = type !== 'debit';
    confirmBtn.classList.toggle('subtract-mode', type === 'debit');
    confirmBtn.textContent = type === 'debit' ? 'Subtract' : 'Add';

    if (type === 'debit') {
      customAmountInput.value = amount.toFixed(2);
    }

    updateModalAmountDisplay();
    renderQuickNotes();

    modalOverlay.hidden = false;
    noteInput.focus();
  }

  function closeModal() {
    modalOverlay.hidden = true;
  }

  addButtons.addEventListener('click', e => {
    const btn = e.target.closest('.btn-add');
    if (!btn) return;
    openModal('credit', Number(btn.dataset.amount));
  });

  openSubtractBtn.addEventListener('click', () => {
    openModal('debit', 0.25);
  });

  stepDownBtn.addEventListener('click', () => {
    currentAmount = Math.max(0.25, round2(currentAmount - 0.25));
    customAmountInput.value = currentAmount.toFixed(2);
    updateModalAmountDisplay();
  });

  stepUpBtn.addEventListener('click', () => {
    currentAmount = round2(currentAmount + 0.25);
    customAmountInput.value = currentAmount.toFixed(2);
    updateModalAmountDisplay();
  });

  customAmountInput.addEventListener('input', () => {
    const val = parseFloat(customAmountInput.value);
    currentAmount = Number.isFinite(val) && val > 0 ? round2(val) : 0;
    updateModalAmountDisplay();
  });

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  quickNotesEl.addEventListener('click', e => {
    const chip = e.target.closest('.quick-note-chip');
    if (!chip) return;
    noteInput.value = chip.dataset.note;
    document.querySelectorAll('.quick-note-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    noteInput.focus();
  });

  cancelBtn.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', e => {
    if (e.target === modalOverlay) closeModal();
  });

  confirmBtn.addEventListener('click', async () => {
    const note = noteInput.value.trim();
    if (!note) {
      modalErrorEl.textContent = 'Please add a note for this transaction.';
      modalErrorEl.hidden = false;
      noteInput.focus();
      return;
    }
    if (!(currentAmount > 0)) {
      modalErrorEl.textContent = 'Please enter an amount greater than $0.';
      modalErrorEl.hidden = false;
      return;
    }

    confirmBtn.disabled = true;
    try {
      const res = await fetch('/api/transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: currentType, amount: currentAmount, note })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save transaction.');
      state = data;
      render();
      closeModal();
    } catch (err) {
      modalErrorEl.textContent = err.message;
      modalErrorEl.hidden = false;
    } finally {
      confirmBtn.disabled = false;
    }
  });

  loadState().catch(err => {
    console.error(err);
    balanceEl.textContent = 'Error';
  });
})();
