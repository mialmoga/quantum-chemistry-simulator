/**
 * ElementLoader.js
 * Loads element data from group-based JSON structure
 */

export class ElementLoader {
    constructor() {
        this.index = null;
        this.elements = {};
        this.activeGroups = new Set();
        this.config = null;
    }
    
    /**
     * Load the master index and initial groups
     */
    async loadIndex() {
        try {
            const response = await fetch('data/elements-index.json');
            this.index = await response.json();
            this.config = this.index.config;
            
            console.log(`📋 Loaded index: ${this.index.total_elements} elements available`);
            
            // Load enabled groups by default
            const loadPromises = [];
            for(const [key, group] of Object.entries(this.index.groups)) {
                if(group.enabled) {
                    loadPromises.push(this.loadGroup(key));
                }
            }
            
            await Promise.all(loadPromises);
            
            console.log(`✅ Loaded ${this.activeGroups.size} groups, ${Object.keys(this.elements).length} elements`);
            
            return this.elements;
        } catch(error) {
            console.error('❌ Failed to load element data:', error);
            throw error;
        }
    }
    
    /**
     * Load a specific element group
     */
    async loadGroup(groupKey) {
        if(this.activeGroups.has(groupKey)) {
            console.log(`⚠️ Group ${groupKey} already loaded`);
            return;
        }
        
        const group = this.index.groups[groupKey];
        if(!group) {
            console.error(`❌ Group ${groupKey} not found in index`);
            return;
        }
        
        try {
            const response = await fetch(`data/${group.file}`);
            const data = await response.json();
            
            // Merge elements, adding group metadata
            for(const [symbol, element] of Object.entries(data.elements)) {
                this.elements[symbol] = {
                    ...element,
                    group: groupKey,
                    groupColor: group.color,
                    groupName: group.name
                };
            }
            
            this.activeGroups.add(groupKey);
            console.log(`✅ Loaded ${group.name}: ${group.count} elements`);
            
        } catch(error) {
            console.error(`❌ Failed to load group ${groupKey}:`, error);
        }
    }
    
    /**
     * Toggle a group on/off
     */
    async toggleGroup(groupKey, enabled) {
        if(enabled && !this.activeGroups.has(groupKey)) {
            await this.loadGroup(groupKey);
            return true;
        } else if(!enabled && this.activeGroups.has(groupKey)) {
            return this.unloadGroup(groupKey);
        }
        return false;
    }
    
    /**
     * Unload a group (remove its elements)
     */
    async unloadGroup(groupKey) {
        if(!this.activeGroups.has(groupKey)) {
            return false;
        }
        
        const group = this.index.groups[groupKey];
        const response = await fetch(`data/${group.file}`);
        const data = await response.json();
        
        // Remove elements from this group
        for(const symbol of Object.keys(data.elements)) {
            delete this.elements[symbol];
        }
        
        this.activeGroups.delete(groupKey);
        console.log(`🗑️ Unloaded ${group.name}`);
        return true;
    }
    
    /**
     * Get all currently loaded elements
     */
    getElements() {
        return this.elements;
    }
    
    /**
     * Get element by symbol
     */
    getElement(symbol) {
        return this.elements[symbol];
    }
    
    /**
     * Get group info
     */
    getGroup(groupKey) {
        return this.index.groups[groupKey];
    }
    
    /**
     * Get all groups
     */
    getGroups() {
        return this.index.groups;
    }
    
    /**
     * Get active groups
     */
    getActiveGroups() {
        return Array.from(this.activeGroups);
    }
    
    /**
     * Get config
     */
    getConfig() {
        return this.config;
    }
    
    /**
     * Check if element is in active groups
     */
    isElementActive(symbol) {
        const element = this.elements[symbol];
        return element && this.activeGroups.has(element.group);
    }
}