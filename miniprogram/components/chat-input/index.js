Component({
  properties: {
    disabled: {
      type: Boolean,
      value: false
    }
  },
  data: {
    inputValue: ''
  },
  methods: {
    onInput(e) {
      this.setData({
        inputValue: e.detail.value
      });
      this.triggerEvent('typing', { value: e.detail.value });
    },
    onSend() {
      if (!this.data.inputValue.trim()) return;
      
      this.triggerEvent('send', {
        content: this.data.inputValue
      });
      
      this.setData({
        inputValue: ''
      });
    }
  }
})
