import { escapeHtml } from '../escape.js';

export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'bento-card';
  toast.setAttribute('role', 'status');
  toast.style.cssText = `
    padding: var(--space-sm) var(--space-lg);
    background-color: var(--inverse-surface);
    color: var(--inverse-on-surface);
    border-radius: var(--radius-default);
    font-family: var(--font-body);
    font-size: 0.875rem;
    box-shadow: 0 4px 10px rgba(0,0,0,0.2);
    pointer-events: auto;
    opacity: 0;
    transform: translateY(20px);
    transition: opacity 0.3s, transform 0.3s;
    display: flex;
    align-items: center;
    gap: var(--space-base);
  `;

  let icon = 'info';
  if (type === 'success') {
    icon = 'check_circle';
    toast.style.borderLeft = '4px solid var(--secondary-container)';
  } else if (type === 'error') {
    icon = 'error';
    toast.style.borderLeft = '4px solid var(--error)';
  } else if (type === 'warning') {
    icon = 'warning';
    toast.style.borderLeft = '4px solid var(--tertiary-container)';
  }

  toast.innerHTML = `
    <span class="material-symbols-outlined" style="font-size: 18px;">${icon}</span>
    <span>${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);

  toast.offsetHeight;
  toast.style.opacity = '1';
  toast.style.transform = 'translateY(0)';

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-20px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}
