import { state, flowState } from './state.js';
import { hasAdminSessionAccess } from './context.js';

const MAIN_VIEWS = ['schedule', 'proposals', 'logistics', 'admin'];
const PROPOSAL_TABS = ['drafts', 'proposed', 'resolved', 'archived'];
const NO_SWIPE_VIEWS = new Set([
  'create',
  'settings',
  'add-partner',
  'add-home',
  'edit-partner',
  'edit-home',
  'activate-partner',
  'login'
]);

const SWIPE_THRESHOLD = 56;
const MAX_VERTICAL_DRIFT = 80;

function getMainViews() {
  return hasAdminSessionAccess()
    ? MAIN_VIEWS
    : MAIN_VIEWS.filter((view) => view !== 'admin');
}

function isModalOpen() {
  const modal = document.getElementById('app-modal');
  return modal?.classList?.contains('open') || modal?.style?.display === 'flex';
}

function navigateProposalTab(direction) {
  const tabs = PROPOSAL_TABS;
  const idx = tabs.indexOf(flowState.activeProposalsTab);
  if (idx === -1) return false;

  const nextIdx = idx + direction;
  if (nextIdx >= 0 && nextIdx < tabs.length) {
    flowState.activeProposalsTab = tabs[nextIdx];
    import('./router.js').then(({ renderView }) => renderView());
    return true;
  }
  return false;
}

function navigateMainView(direction) {
  const views = getMainViews();
  const idx = views.indexOf(state.currentView);
  if (idx === -1) return;

  const nextIdx = idx + direction;
  if (nextIdx >= 0 && nextIdx < views.length) {
    window.location.hash = `#${views[nextIdx]}`;
  }
}

function handleSwipe(direction) {
  if (NO_SWIPE_VIEWS.has(state.currentView)) return;
  if (isModalOpen()) return;

  if (state.currentView === 'proposals') {
    if (navigateProposalTab(direction)) return;
    const views = getMainViews();
    const idx = views.indexOf('proposals');
    const nextIdx = idx + direction;
    if (nextIdx >= 0 && nextIdx < views.length) {
      window.location.hash = `#${views[nextIdx]}`;
    }
    return;
  }

  if (getMainViews().includes(state.currentView)) {
    navigateMainView(direction);
  }
}

export function bindSwipeNavigation() {
  const surface = document.getElementById('app-view-container');
  if (!surface || surface.dataset.swipeNavBound === '1') return;
  surface.dataset.swipeNavBound = '1';

  let startX = 0;
  let startY = 0;
  let tracking = false;

  surface.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    if (NO_SWIPE_VIEWS.has(state.currentView)) return;
    if (isModalOpen()) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    tracking = true;
  }, { passive: true });

  surface.addEventListener('touchend', (e) => {
    if (!tracking) return;
    tracking = false;

    const touch = e.changedTouches[0];
    if (!touch) return;

    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;

    if (Math.abs(dx) < SWIPE_THRESHOLD) return;
    if (Math.abs(dy) > MAX_VERTICAL_DRIFT && Math.abs(dy) > Math.abs(dx)) return;

    handleSwipe(dx < 0 ? 1 : -1);
  }, { passive: true });
}
