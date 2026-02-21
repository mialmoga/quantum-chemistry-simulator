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
        
        // Advanced data tracking
        this.advancedDataLoaded = new Set(); // Which groups have advanced data loaded
        this.advancedDataCache = {};         // Cache of advanced data per group
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
            
            // Parse group color once (always as number)
            const groupColorNum = typeof group.color === 'string' 
                ? parseInt(group.color.replace('0x', ''), 16) 
                : group.color;
            
            // Merge elements, adding group metadata
            for(const [symbol, element] of Object.entries(data.elements)) {
                // Convert element color to number (fixes Bug 1 & 2)
                const elementColorNum = typeof element.color === 'string'
                    ? parseInt(element.color.replace('0x', ''), 16)
                    : element.color;
                
                this.elements[symbol] = {
                    ...element,
                    color: elementColorNum,
                    group: groupKey,
                    groupColor: groupColorNum,
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
            // Automatically load advanced data when activating a group
            await this.loadAdvancedData(groupKey);
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
     * Load advanced data for a specific group
     * @param {string} groupKey - Group identifier (e.g., 'alkali_metals')
     * @returns {Promise<boolean>} - Success status
     */
    async loadAdvancedData(groupKey) {
        // Already loaded?
        if(this.advancedDataLoaded.has(groupKey)) {
            console.log(`⚠️ Advanced data for ${groupKey} already loaded`);
            return true;
        }
        
        const group = this.index.groups[groupKey];
        if(!group) {
            console.error(`❌ Group ${groupKey} not found in index`);
            return false;
        }
        
        // Check if group has advanced data file
        if(!group.file_adv) {
            console.warn(`⚠️ No advanced data file for ${groupKey}`);
            return false;
        }
        
        try {
            const response = await fetch(`data/${group.file_adv}`);
            const advancedData = await response.json();
            
            // Cache the advanced data
            this.advancedDataCache[groupKey] = advancedData;
            
            // Merge advanced data into existing elements
            for(const [symbol, advData] of Object.entries(advancedData)) {
                if(this.elements[symbol]) {
                    // Merge advanced properties into element
                    this.elements[symbol] = {
                        ...this.elements[symbol],
                        ...advData
                    };
                }
            }
            
            this.advancedDataLoaded.add(groupKey);
            console.log(`🔬 Advanced data loaded for ${group.name}`);
            return true;
            
        } catch(error) {
            console.error(`❌ Failed to load advanced data for ${groupKey}:`, error);
            return false;
        }
    }
    
    /**
     * Load advanced data for all active groups
     * @returns {Promise<void>}
     */
    async loadAllAdvancedData() {
        const promises = [];
        for(const groupKey of this.activeGroups) {
            promises.push(this.loadAdvancedData(groupKey));
        }
        await Promise.all(promises);
        console.log(`🔬 Advanced data loaded for ${this.advancedDataLoaded.size} groups`);
    }
    
    /**
     * Get element with optional advanced data
     * @param {string} symbol - Element symbol (e.g., 'H', 'Na')
     * @param {boolean} ensureAdvanced - If true, load advanced data if not present
     * @returns {Promise<Object|null>} - Element data or null
     */
    async getElement(symbol, ensureAdvanced = false) {
        const element = this.elements[symbol];
        if(!element) return null;
        
        // If advanced data requested and not loaded, load it
        if(ensureAdvanced && !this.advancedDataLoaded.has(element.group)) {
            await this.loadAdvancedData(element.group);
            // Return updated element after merge
            return this.elements[symbol];
        }
        
        return element;
    }
    
    /**
     * Check if advanced data is loaded for a group
     */
    hasAdvancedData(groupKey) {
        return this.advancedDataLoaded.has(groupKey);
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
