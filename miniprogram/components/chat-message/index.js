Component({
  properties: {
    msg: {
      type: Object,
      value: {},
      observer: function(newVal) {
        if (newVal && newVal.content) {
            this.setData({
                formattedContent: this.formatText(newVal.content)
            });
        }
      }
    }
  },
  
  data: {
      formattedContent: []
  },

  methods: {
      formatText(text) {
          if (!text) return [];
          // Simple parser: Split by **bold** and \n newlines
          // Returns array of objects: { type: 'text'|'bold'|'break', text: '...' }
          
          const lines = text.split('\n');
          const result = [];
          
          lines.forEach((line, index) => {
              if (index > 0) result.push({ type: 'break' });
              
              // Parse bold **text**
              const parts = line.split(/(\*\*.*?\*\*)/g);
              parts.forEach(part => {
                  if (part.startsWith('**') && part.endsWith('**')) {
                      result.push({ type: 'bold', text: part.slice(2, -2) });
                  } else if (part) {
                      result.push({ type: 'text', text: part });
                  }
              });
          });
          
          return result;
      }
  }
})
