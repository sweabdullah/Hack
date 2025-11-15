const express = require('express');
const db = require('../config/database');
const MessageEngine = require('../services/messageEngine');
const ZidApi = require('../services/zidApi');
const SegmentationService = require('../services/segmentation');

const router = express.Router();
const messageEngine = new MessageEngine();

// Helper to get merchant
function getMerchant(storeId) {
  return db.prepare('SELECT * FROM merchants WHERE store_id = ?').get(storeId);
}

// POST /simulate/send-reminders - Manually trigger reminder sending
router.post('/simulate/send-reminders', express.json(), async (req, res) => {
  try {
    const results = await messageEngine.processPendingReminders();
    
    res.json({
      success: true,
      message: `Processed ${results.length} reminders`,
      results
    });
  } catch (error) {
    console.error('Send reminders error:', error);
    res.status(500).json({ error: 'Failed to send reminders', details: error.message });
  }
});

// POST /api/calculate-reminders - Calculate reminders for orders
router.post('/api/calculate-reminders', express.json(), async (req, res) => {
  try {
    const { store_id } = req.body;
    if (!store_id) {
      return res.status(400).json({ error: 'store_id required' });
    }

    const merchant = getMerchant(store_id);
    if (!merchant) {
      return res.status(404).json({ error: 'Store not found' });
    }

    // Get product settings
    const productSettings = db.prepare(`
      SELECT product_id, product_name, avg_days_to_finish, offset_days
      FROM product_settings
      WHERE store_id = ?
    `).all(store_id);

    if (productSettings.length === 0) {
      return res.json({
        success: true,
        message: 'No product settings configured. Please configure product settings first.',
        reminders_created: 0
      });
    }

    const settingsMap = {};
    productSettings.forEach(setting => {
      settingsMap[setting.product_id] = setting;
    });

    // Fetch orders from Zid API
    const zidApi = new ZidApi(merchant.access_token);
    const orders = await zidApi.getAllOrders();

    let remindersCreated = 0;

    for (const orderData of orders) {
      const order = orderData.order || orderData;
      const customerId = order.customer?.id;
      if (!customerId) continue;

      // Get customer from our DB
      const customer = db.prepare(`
        SELECT id FROM customers WHERE zid_customer_id = ? AND store_id = ?
      `).get(customerId, store_id);

      if (!customer) continue;

      const orderDate = new Date(order.created_at);
      const products = order.products || [];

      for (const product of products) {
        const productId = product.id;
        const setting = settingsMap[productId];

        if (!setting) continue; // Skip if no setting configured

        // Check if product is honey-related (basic check)
        const productName = typeof product.name === 'string' 
          ? product.name 
          : (product.name?.ar || product.name?.en || '');
        
        const isHoney = /عسل|honey|سدر|sidr|حبة البركة|black seed/i.test(productName);
        if (!isHoney) continue;

        // Calculate reminder date
        const quantity = product.quantity || 1;
        let adjustedDays = setting.avg_days_to_finish;
        
        if (quantity >= 2) {
          adjustedDays = Math.round(setting.avg_days_to_finish * 1.5);
        }

        const reminderDate = new Date(orderDate);
        reminderDate.setDate(reminderDate.getDate() + (adjustedDays - setting.offset_days));

        // Check if reminder already exists
        const existing = db.prepare(`
          SELECT id FROM reminders 
          WHERE customer_id = ? AND product_id = ? AND order_id = ?
        `).get(customer.id, productId, order.id);

        if (!existing) {
          await messageEngine.createReminder(
            customer.id,
            productId,
            order.id,
            reminderDate
          );
          remindersCreated++;
        }
      }
    }

    res.json({
      success: true,
      message: `Created ${remindersCreated} reminders`,
      reminders_created: remindersCreated
    });
  } catch (error) {
    console.error('Calculate reminders error:', error);
    res.status(500).json({ error: 'Failed to calculate reminders', details: error.message });
  }
});

// GET /api/reminders - Get all reminders
router.get('/api/reminders', (req, res) => {
  try {
    const storeId = parseInt(req.query.store_id);
    if (!storeId) {
      return res.status(400).json({ error: 'store_id required' });
    }

    const reminders = db.prepare(`
      SELECT r.*, c.name as customer_name, c.phone, ps.product_name
      FROM reminders r
      JOIN customers c ON r.customer_id = c.id
      LEFT JOIN product_settings ps ON r.product_id = ps.product_id AND c.store_id = ps.store_id
      WHERE c.store_id = ?
      ORDER BY r.send_at ASC
    `).all(storeId);

    res.json({
      success: true,
      reminders: reminders.map(r => ({
        id: r.id,
        customer_name: r.customer_name,
        product_name: r.product_name,
        send_at: r.send_at,
        status: r.status,
        created_at: r.created_at
      }))
    });
  } catch (error) {
    console.error('Get reminders error:', error);
    res.status(500).json({ error: 'Failed to fetch reminders', details: error.message });
  }
});

module.exports = router;

