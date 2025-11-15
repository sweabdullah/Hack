const db = require('../config/database');

class MessageEngine {
  constructor() {
    this.messageTemplate = `مرحبًا {{name}} 👋  
حسب آخر طلب لمنتج {{product_name}} نتوقع أنك على وشك الانتهاء 🐝  
تقدر تعيد الطلب الآن من الرابط: {{link}}  
استخدم الكود HONEY5 واحصل على 5% خصم ✨`;
  }

  replacePlaceholders(template, data) {
    let message = template;
    Object.keys(data).forEach(key => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      message = message.replace(regex, data[key] || '');
    });
    return message;
  }

  async getPendingReminders() {
    const now = new Date().toISOString();
    return db.prepare(`
      SELECT r.*, c.name as customer_name, c.phone, c.email, ps.product_name
      FROM reminders r
      JOIN customers c ON r.customer_id = c.id
      LEFT JOIN product_settings ps ON r.product_id = ps.product_id AND c.store_id = ps.store_id
      WHERE r.status = 'PENDING' AND r.send_at <= ?
      ORDER BY r.send_at ASC
    `).all(now);
  }

  async sendReminder(reminder) {
    try {
      // Simulate message sending (for hackathon)
      const message = this.replacePlaceholders(
        reminder.message_template || this.messageTemplate,
        {
          name: reminder.customer_name || 'عميلنا الكريم',
          product_name: reminder.product_name || 'المنتج',
          link: `https://store.zid.store/products/${reminder.product_id}`
        }
      );

      console.log('='.repeat(50));
      console.log(`[Message Engine] Sending reminder to ${reminder.customer_name} (${reminder.phone})`);
      console.log('Message:');
      console.log(message);
      console.log('='.repeat(50));

      // Mark as sent
      db.prepare(`
        UPDATE reminders 
        SET status = 'SENT' 
        WHERE id = ?
      `).run(reminder.id);

      return { success: true, message };
    } catch (error) {
      console.error(`[Message Engine] Error sending reminder ${reminder.id}:`, error);
      return { success: false, error: error.message };
    }
  }

  async processPendingReminders() {
    const reminders = await this.getPendingReminders();
    console.log(`[Message Engine] Found ${reminders.length} pending reminders`);

    const results = [];
    for (const reminder of reminders) {
      const result = await this.sendReminder(reminder);
      results.push({ reminderId: reminder.id, ...result });
    }

    return results;
  }

  async createReminder(customerId, productId, orderId, sendAt, customTemplate = null) {
    const template = customTemplate || this.messageTemplate;
    
    const result = db.prepare(`
      INSERT INTO reminders (customer_id, product_id, order_id, send_at, message_template, status)
      VALUES (?, ?, ?, ?, ?, 'PENDING')
    `).run(customerId, productId, orderId, sendAt.toISOString(), template);

    return result.lastInsertRowid;
  }
}

module.exports = MessageEngine;

