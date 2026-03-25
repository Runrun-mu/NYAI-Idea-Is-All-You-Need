// Pagination Component
const Pagination = (() => {
  function renderPagination(container, { totalItems, pageSize, currentPage, onPageChange }) {
    container.innerHTML = '';

    const totalPages = Math.ceil(totalItems / pageSize);
    if (totalPages <= 1) return;

    const nav = document.createElement('div');
    nav.className = 'pagination';

    // Prev button
    const prevBtn = document.createElement('button');
    prevBtn.className = 'pagination-btn';
    prevBtn.textContent = '← Prev';
    prevBtn.disabled = currentPage <= 1;
    prevBtn.addEventListener('click', () => onPageChange(currentPage - 1));
    nav.appendChild(prevBtn);

    // Page numbers
    const maxVisible = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);
    if (endPage - startPage < maxVisible - 1) {
      startPage = Math.max(1, endPage - maxVisible + 1);
    }

    if (startPage > 1) {
      nav.appendChild(createPageBtn(1, currentPage, onPageChange));
      if (startPage > 2) {
        const dots = document.createElement('span');
        dots.className = 'pagination-btn';
        dots.textContent = '...';
        dots.style.cursor = 'default';
        dots.style.border = 'none';
        nav.appendChild(dots);
      }
    }

    for (let i = startPage; i <= endPage; i++) {
      nav.appendChild(createPageBtn(i, currentPage, onPageChange));
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        const dots = document.createElement('span');
        dots.className = 'pagination-btn';
        dots.textContent = '...';
        dots.style.cursor = 'default';
        dots.style.border = 'none';
        nav.appendChild(dots);
      }
      nav.appendChild(createPageBtn(totalPages, currentPage, onPageChange));
    }

    // Next button
    const nextBtn = document.createElement('button');
    nextBtn.className = 'pagination-btn';
    nextBtn.textContent = 'Next →';
    nextBtn.disabled = currentPage >= totalPages;
    nextBtn.addEventListener('click', () => onPageChange(currentPage + 1));
    nav.appendChild(nextBtn);

    container.appendChild(nav);
  }

  function createPageBtn(page, currentPage, onPageChange) {
    const btn = document.createElement('button');
    btn.className = 'pagination-btn' + (page === currentPage ? ' active' : '');
    btn.textContent = page;
    btn.addEventListener('click', () => onPageChange(page));
    return btn;
  }

  return { renderPagination };
})();
