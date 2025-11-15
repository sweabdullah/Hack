const MessageEngine = require('../services/messageEngine');

class ReminderCron {
  constructor(intervalMinutes = 5) {
    this.intervalMinutes = intervalMinutes;
    this.messageEngine = new MessageEngine();
    this.intervalId = null;
  }

  start() {
    console.log(`[ReminderCron] Starting reminder checker (every ${this.intervalMinutes} minutes)`);
    
    // Run immediately on start
    this.processReminders();

    // Then run on interval
    this.intervalId = setInterval(() => {
      this.processReminders();
    }, this.intervalMinutes * 60 * 1000);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[ReminderCron] Stopped');
    }
  }

  async processReminders() {
    try {
      console.log(`[ReminderCron] Checking for pending reminders at ${new Date().toISOString()}`);
      const results = await this.messageEngine.processPendingReminders();
      
      if (results.length > 0) {
        const successCount = results.filter(r => r.success).length;
        console.log(`[ReminderCron] Processed ${successCount}/${results.length} reminders successfully`);
      }
    } catch (error) {
      console.error('[ReminderCron] Error processing reminders:', error);
    }
  }
}

module.exports = ReminderCron;

