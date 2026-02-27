/**
 * panels.js
 * UI panel logic: tab toggles, collapse behavior.
 * Extracted from inline <script> in index.html.
 *
 * Called from app.js after DOM is ready (inside init()).
 */

/**
 * Initialize the Molecules / Crystals tab toggle inside the Add Panel.
 */
export function initAddPanelTabs() {
    const showMoleculesBtn  = document.getElementById('showMolecules');
    const showCrystalsBtn   = document.getElementById('showCrystals');
    const moleculesSection  = document.getElementById('moleculesSection');
    const crystalsSection   = document.getElementById('crystalsSection');

    if (!showMoleculesBtn || !showCrystalsBtn) return;

    function activateTab(activeBtn, inactiveBtn, showEl, hideEl) {
        showEl.classList.remove('hidden');
        hideEl.classList.add('hidden');

        activeBtn.classList.replace('add-panel__tab--inactive', 'add-panel__tab--active');
        inactiveBtn.classList.replace('add-panel__tab--active', 'add-panel__tab--inactive');
    }

    showMoleculesBtn.addEventListener('click', () => {
        activateTab(showMoleculesBtn, showCrystalsBtn, moleculesSection, crystalsSection);
    });

    showCrystalsBtn.addEventListener('click', () => {
        activateTab(showCrystalsBtn, showMoleculesBtn, crystalsSection, moleculesSection);
    });
}
