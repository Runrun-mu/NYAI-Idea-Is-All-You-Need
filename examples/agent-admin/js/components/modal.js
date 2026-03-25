// Modal Component
const Modal = (() => {
  function showModal({ title, message, onConfirm, onCancel }) {
    // Remove any existing modal
    const existing = document.querySelector('.modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-dialog">
        <div class="modal-title">${title}</div>
        <div class="modal-message">${message}</div>
        <div class="modal-actions">
          <button class="btn btn-ghost modal-cancel-btn">Cancel</button>
          <button class="btn btn-danger modal-confirm-btn">Confirm</button>
        </div>
      </div>
    `;

    const close = () => overlay.remove();

    overlay.querySelector('.modal-cancel-btn').addEventListener('click', () => {
      close();
      if (onCancel) onCancel();
    });

    overlay.querySelector('.modal-confirm-btn').addEventListener('click', () => {
      close();
      if (onConfirm) onConfirm();
    });

    // Close on backdrop click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        close();
        if (onCancel) onCancel();
      }
    });

    document.body.appendChild(overlay);
  }

  return { showModal };
})();
