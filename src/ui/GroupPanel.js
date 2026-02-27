/**
 * GroupPanel.js
 * UI panel for toggling element groups on/off.
 *
 * CAMBIOS v0.11:
 * - Eliminados TODOS los style.cssText / style.xxx inline.
 * - Todos los estilos viven en GroupPanel.css.
 * - hover de botones: CSS :hover en lugar de mouseenter/mouseleave JS.
 * - Estados del botón "Datos Avanzados": clases CSS semánticas.
 */

export class GroupPanel {
    constructor(elementLoader, onGroupToggle) {
        this.elementLoader = elementLoader;
        this.onGroupToggle = onGroupToggle;
        this.panel         = null;
        this.checkboxes    = {};
    }

    // ── Crear e inyectar el panel en el DOM ──────────────────────────────────
    createPanel() {
        // Panel container — estilos en GroupPanel.css → #groupPanel
        this.panel    = document.createElement('div');
        this.panel.id = 'groupPanel';

        // Header
        const header     = document.createElement('div');
        header.className = 'group-panel__header';

        const title       = document.createElement('span');
        title.textContent = '🧪 GRUPOS';

        const headerActions     = document.createElement('div');
        headerActions.className = 'group-panel__header-actions';

        // Sort toggle button
        const sortBtn     = document.createElement('button');
        sortBtn.id        = 'sortToggleBtn';
        sortBtn.className = 'group-panel__btn';
        sortBtn.innerHTML = '#️⃣ Núm';
        sortBtn.title     = 'Cambiar ordenamiento del selector';

        sortBtn.addEventListener('click', () => {
            if(window.elementSortMode === 'number') {
                window.elementSortMode = 'group';
                sortBtn.innerHTML = '🏷️ Grupo';
                sortBtn.title     = 'Ordenado por grupo — Click para ordenar por número';
            } else {
                window.elementSortMode = 'number';
                sortBtn.innerHTML = '#️⃣ Núm';
                sortBtn.title     = 'Ordenado por número — Click para ordenar por grupo';
            }
            if(this.onGroupToggle) this.onGroupToggle(null, true);
        });

        // Collapse button inside header (▶)
        const panelCollapseBtn     = document.createElement('button');
        panelCollapseBtn.id        = 'panelCollapseBtn';
        panelCollapseBtn.className = 'group-panel__btn';
        panelCollapseBtn.textContent = '▶';
        panelCollapseBtn.title     = 'Colapsar panel';

        panelCollapseBtn.addEventListener('click', () => {
            this.panel.classList.add('hidden');
            collapseBtn.classList.add('visible');
        });

        headerActions.appendChild(sortBtn);
        headerActions.appendChild(panelCollapseBtn);
        header.appendChild(title);
        header.appendChild(headerActions);
        this.panel.appendChild(header);

        // Groups container
        const groupsContainer = document.createElement('div');
        groupsContainer.id    = 'groupsContainer';
        this.panel.appendChild(groupsContainer);
        this.populateGroups(groupsContainer);

        // Advanced data button
        const advancedBtn     = document.createElement('button');
        advancedBtn.id        = 'loadAdvancedDataBtn';
        advancedBtn.className = 'group-panel__advanced-btn';
        advancedBtn.innerHTML = '🔬 Cargar Datos Avanzados';
        advancedBtn.title     = 'Carga propiedades avanzadas (40+ por elemento) para física detallada';

        advancedBtn.addEventListener('click', async () => {
            advancedBtn.disabled  = true;
            advancedBtn.innerHTML = '⏳ Cargando...';
            advancedBtn.classList.remove(
                'group-panel__advanced-btn--loaded',
                'group-panel__advanced-btn--error'
            );

            try {
                await this.elementLoader.loadAllAdvancedData();
                advancedBtn.innerHTML = '✅ Datos Avanzados Cargados';
                advancedBtn.classList.add('group-panel__advanced-btn--loaded');
                if(window.showHint) window.showHint('🔬 Datos avanzados cargados (40+ propiedades por elemento)');
            } catch(error) {
                advancedBtn.innerHTML = '❌ Error al cargar';
                advancedBtn.classList.add('group-panel__advanced-btn--error');
                console.error('Failed to load advanced data:', error);
            }
        });

        this.panel.appendChild(advancedBtn);

        // Stats footer
        const footer     = document.createElement('div');
        footer.id        = 'groupStats';
        footer.className = 'group-panel__footer';
        this.panel.appendChild(footer);
        this.updateStats();

        // External collapse button (◀ Grupos) — estilos en GroupPanel.css → #collapseGroups
        const collapseBtn       = document.createElement('button');
        collapseBtn.id          = 'collapseGroups';
        collapseBtn.textContent = '◀ Grupos';

        collapseBtn.addEventListener('click', () => {
            this.panel.classList.remove('hidden');
            collapseBtn.classList.remove('visible');
        });

        document.body.appendChild(this.panel);
        document.body.appendChild(collapseBtn);

        return this.panel;
    }

    // ── Poblar grupos con checkboxes ─────────────────────────────────────────
    populateGroups(container) {
        const groups       = this.elementLoader.getGroups();
        const activeGroups = this.elementLoader.getActiveGroups();

        for(const [key, group] of Object.entries(groups)) {
            const item     = document.createElement('div');
            item.className = 'group-panel__item';

            const checkbox     = document.createElement('input');
            checkbox.type      = 'checkbox';
            checkbox.id        = `group_${key}`;
            checkbox.checked   = activeGroups.includes(key);
            checkbox.className = 'group-panel__checkbox';
            checkbox.addEventListener('change', async (e) => {
                await this.toggleGroup(key, e.target.checked);
            });
            this.checkboxes[key] = checkbox;

            // Color swatch — background es dinámico (dato del grupo), inline intencional
            const colorBox     = document.createElement('div');
            colorBox.className = 'group-panel__color-box';
            colorBox.style.background = `#${group.color.replace('0x', '')}`;

            const label     = document.createElement('label');
            label.htmlFor   = `group_${key}`;
            label.className = 'group-panel__label';
            label.innerHTML = `${group.name} <span class="group-panel__count">(${group.count})</span>`;

            item.appendChild(checkbox);
            item.appendChild(colorBox);
            item.appendChild(label);
            container.appendChild(item);
        }
    }

    // ── Toggle de grupo ──────────────────────────────────────────────────────
    async toggleGroup(groupKey, enabled) {
        const checkbox    = this.checkboxes[groupKey];
        checkbox.disabled = true;

        try {
            const changed = await this.elementLoader.toggleGroup(groupKey, enabled);
            if(changed) {
                this.updateStats();
                if(this.onGroupToggle) this.onGroupToggle(groupKey, enabled);
                console.log(`${enabled ? '✅' : '❌'} Group ${groupKey}: ${enabled ? 'enabled' : 'disabled'}`);
            }
        } catch(error) {
            console.error(`Error toggling group ${groupKey}:`, error);
            checkbox.checked = !enabled; // Revert on error
        } finally {
            checkbox.disabled = false;
        }
    }

    // ── Stats footer ─────────────────────────────────────────────────────────
    updateStats() {
        const footer = document.getElementById('groupStats');
        if(!footer) return;

        const activeCount  = Object.keys(this.elementLoader.getElements()).length;
        const totalCount   = this.elementLoader.index.total_elements;
        const activeGroups = this.elementLoader.getActiveGroups().length;
        const totalGroups  = Object.keys(this.elementLoader.getGroups()).length;

        footer.innerHTML = `
            <div><strong>${activeCount}</strong>/${totalCount} elementos</div>
            <div><strong>${activeGroups}</strong>/${totalGroups} grupos activos</div>
        `;
    }

    // ── Refresh (tras cambios externos) ──────────────────────────────────────
    refresh() {
        const container = document.getElementById('groupsContainer');
        if(container) {
            container.innerHTML = '';
            this.checkboxes     = {};
            this.populateGroups(container);
            this.updateStats();
        }
    }

    // ── Show/hide ─────────────────────────────────────────────────────────────
    toggle(visible) {
        if(this.panel) this.panel.classList.toggle('hidden', !visible);
    }
}
