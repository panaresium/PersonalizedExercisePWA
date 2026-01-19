  async play() {
      await initAudio();
      await this.requestWakeLock();

      if (this.status === 'COMPLETED') {
          this.currentIndex = 0;
          this.elapsedInStep = 0;
      }

      if (this.status === 'IDLE') {
          this.sessionStart = new Date().toISOString();
      }

      this.status = 'RUNNING';
      this.lastTick = Date.now();

      this.timerInterval = requestAnimationFrame(this.tick.bind(this));
      this.renderControls(); // update button label

      // Schedule Start Beep if just starting step
      if (this.elapsedInStep === 0) {
          const item = this.playlist[this.currentIndex];
          if (item) {
             const duration = item.type === 'REST' ? item.duration : (item.step.durationSec || 0);
             // On start, remaining time is full duration
             this.checkBeeps(duration, item);
          }
      }
  }