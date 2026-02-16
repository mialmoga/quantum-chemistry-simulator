/**
 * GroupPanel.js
 * UI panel for toggling element groups on/off
 */

export class GroupPanel {
    constructor(elementLoader, onGroupToggle) {
        this.elementLoader = elementLoader;
        this.onGroupToggle = onGroupToggle; // Callback when group changes
        this.panel = null;
        this.checkboxes = {};
    }
    
    /**
     * Create and inject the panel into DOM
     */
    createPanel() {
        // Create panel container
        this.panel = document.createElement('div');
        this.panel.id = 'groupPanel';
        this.panel.className = 'panel';
        this.panel.style.cssText = `
            position: fixed;
            top: 50%;
            right: 20px;
            transform: translateY(-50%);
            background: rgba(20, 20, 30, 0.95);
            border: 1px solid rgba(100, 200, 255, 0.3);
            border-radius: 8px;
            padding: 15px;
            color: white;
            font-family: 'Segoe UI', system-ui, sans-serif;
            font-size: 13px;
            max-height: 80vh;
            overflow-y: auto;
            backdrop-filter: blur(10px);
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
            z-index: 100;
            min-width: 240px;
        `;
        
        // Header
        const header = document.createElement('div');
        header.style.cssText = `
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 12px;
            padding-bottom: 8px;
            border-bottom: 1px solid rgba(100, 200, 255, 0.2);
            color: #64c8ff;
            display: flex;
            justify-content: space-between;
            align-items: center;
        `;
        header.innerHTML = `
            <span>🧪 GRUPOS</span>
            <button id="sortToggleBtn" style="
                background: rgba(100, 200, 255, 0.1);
                border: 1px solid rgba(100, 200, 255, 0.3);
                border-radius: 4px;
                color: rgba(255, 255, 255, 0.8);
                padding: 4px 8px;
                font-size: 10px;
                cursor: pointer;
                transition: all 0.2s;
            " title="Cambiar ordenamiento del selector">
                #️⃣ Núm
            </button>
        `;
        this.panel.appendChild(header);
        
        // Add sort toggle functionality
        const sortBtn = header.querySelector('#sortToggleBtn');
        sortBtn.addEventListener('click', () => {
            // Toggle sort mode (accessed via global scope)
            if(window.elementSortMode === 'number') {
                window.elementSortMode = 'group';
                sortBtn.innerHTML = '🏷️ Grupo';
                sortBtn.title = 'Ordenado por grupo - Click para ordenar por número';
            } else {
                window.elementSortMode = 'number';
                sortBtn.innerHTML = '#️⃣ Núm';
                sortBtn.title = 'Ordenado por número - Click para ordenar por grupo';
            }
            
            // Trigger refresh of element grid
            if(this.onGroupToggle) {
                this.onGroupToggle(null, true); // Null groupKey means just refresh
            }
        });
        sortBtn.addEventListener('mouseenter', () => {
            sortBtn.style.background = 'rgba(100, 200, 255, 0.2)';
            sortBtn.style.borderColor = 'rgba(100, 200, 255, 0.5)';
        });
        sortBtn.addEventListener('mouseleave', () => {
            sortBtn.style.background = 'rgba(100, 200, 255, 0.1)';
            sortBtn.style.borderColor = 'rgba(100, 200, 255, 0.3)';
        });
        
        // Groups container
        const groupsContainer = document.createElement('div');
        groupsContainer.id = 'groupsContainer';
        this.panel.appendChild(groupsContainer);
        
        // Populate groups
        this.populateGroups(groupsContainer);
        
        // Stats footer
        const footer = document.createElement('div');
        footer.id = 'groupStats';
        footer.style.cssText = `
            margin-top: 12px;
            padding-top: 8px;
            border-top: 1px solid rgba(100, 200, 255, 0.2);
            font-size: 11px;
            color: rgba(255, 255, 255, 0.6);
            text-align: center;
        `;
        this.panel.appendChild(footer);
        this.updateStats();
        
        // Collapse button
        const collapseBtn = document.createElement('button');
        collapseBtn.id = 'collapseGroups';
        collapseBtn.textContent = '◀ Grupos';
        collapseBtn.style.cssText = `
            position: fixed;
            top: 50%;
            right: 20px;
            transform: translateY(-50%);
            background: rgba(20, 20, 30, 0.95);
            border: 1px solid rgba(100, 200, 255, 0.3);
            border-radius: 6px;
            color: #64c8ff;
            padding: 8px 12px;
            font-size: 12px;
            cursor: pointer;
            z-index: 99;
            display: none;
        `;
        
        collapseBtn.addEventListener('click', () => {
            this.panel.style.display = 'block';
            collapseBtn.style.display = 'none';
        });
        
        // Add collapse functionality to panel
        const panelCollapseBtn = document.createElement('button');
        panelCollapseBtn.textContent = '▶';
        panelCollapseBtn.style.cssText = `
            position: absolute;
            top: 10px;
            right: 10px;
            background: transparent;
            border: none;
            color: rgba(255, 255, 255, 0.5);
            font-size: 16px;
            cursor: pointer;
            padding: 4px 8px;
        `;
        panelCollapseBtn.addEventListener('click', () => {
            this.panel.style.display = 'none';
            collapseBtn.style.display = 'block';
        });
        this.panel.appendChild(panelCollapseBtn);
        
        // Inject into DOM
        document.body.appendChild(this.panel);
        document.body.appendChild(collapseBtn);
        
        return this.panel;
    }
    
    /**
     * Populate groups with checkboxes
     */
    populateGroups(container) {
        const groups = this.elementLoader.getGroups();
        const activeGroups = this.elementLoader.getActiveGroups();
        
        for(const [key, group] of Object.entries(groups)) {
            const groupItem = document.createElement('div');
            groupItem.style.cssText = `
                display: flex;
                align-items: center;
                margin-bottom: 8px;
                padding: 6px;
                border-radius: 4px;
                transition: background 0.2s;
            `;
            groupItem.addEventListener('mouseenter', () => {
                groupItem.style.background = 'rgba(100, 200, 255, 0.1)';
            });
            groupItem.addEventListener('mouseleave', () => {
                groupItem.style.background = 'transparent';
            });
            
            // Checkbox
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `group_${key}`;
            checkbox.checked = activeGroups.includes(key);
            checkbox.style.cssText = `
                margin-right: 8px;
                cursor: pointer;
                width: 14px;
                height: 14px;
            `;
            
            checkbox.addEventListener('change', async (e) => {
                await this.toggleGroup(key, e.target.checked);
            });
            
            this.checkboxes[key] = checkbox;
            
            // Color indicator
            const colorBox = document.createElement('div');
            colorBox.style.cssText = `
                width: 16px;
                height: 16px;
                border-radius: 3px;
                background: #${group.color.replace('0x', '')};
                margin-right: 8px;
                box-shadow: 0 0 4px rgba(0,0,0,0.3);
            `;
            
            // Label
            const label = document.createElement('label');
            label.htmlFor = `group_${key}`;
            label.style.cssText = `
                flex: 1;
                cursor: pointer;
                font-size: 12px;
            `;
            label.innerHTML = `
                ${group.name}
                <span style="color: rgba(255,255,255,0.4); margin-left: 4px;">(${group.count})</span>
            `;
            
            groupItem.appendChild(checkbox);
            groupItem.appendChild(colorBox);
            groupItem.appendChild(label);
            container.appendChild(groupItem);
        }
    }
    
    /**
     * Toggle group on/off
     */
    async toggleGroup(groupKey, enabled) {
        const checkbox = this.checkboxes[groupKey];
        checkbox.disabled = true;
        
        try {
            const changed = await this.elementLoader.toggleGroup(groupKey, enabled);
            
            if(changed) {
                this.updateStats();
                
                // Call callback if provided
                if(this.onGroupToggle) {
                    this.onGroupToggle(groupKey, enabled);
                }
                
                console.log(`${enabled ? '✅' : '❌'} Group ${groupKey}: ${enabled ? 'enabled' : 'disabled'}`);
            }
        } catch(error) {
            console.error(`Error toggling group ${groupKey}:`, error);
            checkbox.checked = !enabled; // Revert on error
        } finally {
            checkbox.disabled = false;
        }
    }
    
    /**
     * Update statistics footer
     */
    updateStats() {
        const footer = document.getElementById('groupStats');
        if(!footer) return;
        
        const activeCount = Object.keys(this.elementLoader.getElements()).length;
        const totalCount = this.elementLoader.index.total_elements;
        const activeGroups = this.elementLoader.getActiveGroups().length;
        const totalGroups = Object.keys(this.elementLoader.getGroups()).length;
        
        footer.innerHTML = `
            <div style="margin-bottom: 4px;">
                <strong>${activeCount}</strong>/${totalCount} elementos
            </div>
            <div>
                <strong>${activeGroups}</strong>/${totalGroups} grupos activos
            </div>
        `;
    }
    
    /**
     * Refresh panel (after external changes)
     */
    refresh() {
        const container = document.getElementById('groupsContainer');
        if(container) {
            container.innerHTML = '';
            this.checkboxes = {};
            this.populateGroups(container);
            this.updateStats();
        }
    }
    
    /**
     * Show/hide panel
     */
    toggle(visible) {
        if(this.panel) {
            this.panel.style.display = visible ? 'block' : 'none';
        }
    }
}