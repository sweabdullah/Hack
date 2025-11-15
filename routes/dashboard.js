const express = require('express');
const db = require('../config/database');
const SegmentationService = require('../services/segmentation');
const ZidApi = require('../services/zidApi');
const MessageEngine = require('../services/messageEngine');

const router = express.Router();
const messageEngine = new MessageEngine();

// Helper to get merchant by store_id
function getMerchant(storeId) {
  return db.prepare('SELECT * FROM merchants WHERE store_id = ?').get(storeId);
}

// GET /dashboard/customers - Get segmented customer data
router.get('/dashboard/customers', async (req, res) => {
  try {
    const storeId = parseInt(req.query.store_id) || 1; // Default to 1 for testing

    const merchant = getMerchant(storeId);
    if (!merchant) {
      return res.status(404).json({ error: 'Store not found. Please install first.' });
    }

    // Get customer stats
    const segmentationService = new SegmentationService(storeId, merchant.access_token);
    const stats = segmentationService.getCustomerStats(storeId);

    // Get all customers with details
    const customers = db.prepare(`
      SELECT 
        id,
        zid_customer_id,
        name,
        phone,
        email,
        total_orders,
        total_spent,
        last_order_date,
        days_since_last_order,
        segment,
        is_vip
      FROM customers
      WHERE store_id = ?
      ORDER BY 
        CASE segment
          WHEN 'NEW' THEN 1
          WHEN 'ACTIVE' THEN 2
          WHEN 'AT_RISK' THEN 3
          WHEN 'CHURNED' THEN 4
          ELSE 5
        END,
        days_since_last_order ASC
    `).all(storeId);

    // Format customers for display
    const formattedCustomers = customers.map(customer => {
      const lastOrderDate = customer.last_order_date 
        ? new Date(customer.last_order_date)
        : null;
      
      let lastOrderText = 'N/A';
      if (lastOrderDate) {
        const days = customer.days_since_last_order;
        if (days === 0) lastOrderText = 'Today';
        else if (days === 1) lastOrderText = '1 day ago';
        else if (days < 7) lastOrderText = `${days} days ago`;
        else if (days < 30) lastOrderText = `${Math.floor(days / 7)} weeks ago`;
        else lastOrderText = `${Math.floor(days / 30)} months ago`;
      }

      return {
        id: customer.id,
        zid_customer_id: customer.zid_customer_id,
        name: customer.name || 'Unknown',
        phone: customer.phone || '',
        email: customer.email || '',
        total_orders: customer.total_orders,
        total_spent: customer.total_spent.toFixed(2),
        last_order: lastOrderText,
        days_since_last_order: customer.days_since_last_order,
        segment: customer.segment,
        is_vip: customer.is_vip === 1
      };
    });

    res.json({
      success: true,
      stats,
      customers: formattedCustomers,
      total: formattedCustomers.length
    });
  } catch (error) {
    console.error('Dashboard customers error:', error);
    res.status(500).json({ error: 'Failed to fetch customers', details: error.message });
  }
});

// GET /dashboard/products - Get products with settings
router.get('/dashboard/products', async (req, res) => {
  try {
    const storeId = parseInt(req.query.store_id) || 1;

    const merchant = getMerchant(storeId);
    if (!merchant) {
      return res.status(404).json({ error: 'Store not found. Please install first.' });
    }

    const zidApi = new ZidApi(merchant.access_token);
    const products = await zidApi.getAllProducts();

    // Get product settings from database
    const productSettings = db.prepare(`
      SELECT product_id, product_name, avg_days_to_finish, offset_days
      FROM product_settings
      WHERE store_id = ?
    `).all(storeId);

    const settingsMap = {};
    productSettings.forEach(setting => {
      settingsMap[setting.product_id] = setting;
    });

    // Format products
    const formattedProducts = products.map(product => {
      const productId = product.id || product.product_id;
      const productName = typeof product.name === 'string' 
        ? product.name 
        : (product.name?.ar || product.name?.en || 'Unknown Product');
      
      const setting = settingsMap[productId] || {
        product_id: productId,
        product_name: productName,
        avg_days_to_finish: 30,
        offset_days: 5
      };

      return {
        id: productId,
        name: productName,
        sku: product.sku || '',
        price: product.price || 0,
        sale_price: product.sale_price || null,
        avg_days_to_finish: setting.avg_days_to_finish,
        offset_days: setting.offset_days,
        has_setting: !!settingsMap[productId]
      };
    });

    res.json({
      success: true,
      products: formattedProducts,
      total: formattedProducts.length
    });
  } catch (error) {
    console.error('Dashboard products error:', error);
    res.status(500).json({ error: 'Failed to fetch products', details: error.message });
  }
});

// POST /settings/product/:id - Update product settings
router.post('/settings/product/:id', express.json(), (req, res) => {
  try {
    const productId = req.params.id;
    const { store_id, product_name, avg_days_to_finish, offset_days } = req.body;

    if (!store_id || !avg_days_to_finish || !offset_days) {
      return res.status(400).json({ 
        error: 'Missing required fields: store_id, avg_days_to_finish, offset_days' 
      });
    }

    const merchant = getMerchant(store_id);
    if (!merchant) {
      return res.status(404).json({ error: 'Store not found' });
    }

    // Upsert product setting
    const existing = db.prepare(`
      SELECT id FROM product_settings 
      WHERE product_id = ? AND store_id = ?
    `).get(productId, store_id);

    if (existing) {
      db.prepare(`
        UPDATE product_settings
        SET product_name = ?, avg_days_to_finish = ?, offset_days = ?, updated_at = CURRENT_TIMESTAMP
        WHERE product_id = ? AND store_id = ?
      `).run(product_name, avg_days_to_finish, offset_days, productId, store_id);
    } else {
      db.prepare(`
        INSERT INTO product_settings (product_id, store_id, product_name, avg_days_to_finish, offset_days)
        VALUES (?, ?, ?, ?, ?)
      `).run(productId, store_id, product_name, avg_days_to_finish, offset_days);
    }

    res.json({
      success: true,
      message: 'Product settings updated',
      product_id: productId,
      settings: {
        avg_days_to_finish,
        offset_days
      }
    });
  } catch (error) {
    console.error('Update product settings error:', error);
    res.status(500).json({ error: 'Failed to update settings', details: error.message });
  }
});

// POST /api/sync-customers - Trigger customer segmentation sync
router.post('/api/sync-customers', express.json(), async (req, res) => {
  try {
    const { store_id } = req.body;
    if (!store_id) {
      return res.status(400).json({ error: 'store_id required' });
    }

    const merchant = getMerchant(store_id);
    if (!merchant) {
      return res.status(404).json({ error: 'Store not found. Please install first.' });
    }

    const segmentationService = new SegmentationService(store_id, merchant.access_token);
    const result = await segmentationService.syncCustomers();

    res.json({
      success: true,
      message: 'Customer sync completed',
      ...result
    });
  } catch (error) {
    console.error('Sync customers error:', error);
    res.status(500).json({ error: 'Sync failed', details: error.message });
  }
});

// POST /api/send-message/:customerId - Send message to a specific customer
router.post('/api/send-message/:customerId', express.json(), async (req, res) => {
  try {
    const customerId = parseInt(req.params.customerId);
    const { store_id, segment } = req.body;

    if (!customerId) {
      return res.status(400).json({ error: 'customerId required' });
    }

    if (!store_id) {
      return res.status(400).json({ error: 'store_id required' });
    }

    if (!segment) {
      return res.status(400).json({ error: 'segment required (NEW, AT_RISK, VIP, or CHURNED)' });
    }

    // Validate segment
    const validSegments = ['NEW', 'AT_RISK', 'VIP', 'CHURNED'];
    if (!validSegments.includes(segment)) {
      return res.status(400).json({ error: `Invalid segment. Must be one of: ${validSegments.join(', ')}` });
    }

    // Get merchant for store name (default to 'متجرنا' if not available)
    const merchant = getMerchant(store_id);
    const storeName = merchant?.store_name || 'متجرنا';

    // Verify customer belongs to this store
    const customer = db.prepare(`
      SELECT id, store_id, segment
      FROM customers
      WHERE id = ? AND store_id = ?
    `).get(customerId, store_id);

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found or does not belong to this store' });
    }

    // Send the message
    const result = await messageEngine.sendSegmentMessage(customerId, segment, storeName);

    if (result.success) {
      res.json({
        success: true,
        message: 'Message sent successfully',
        customer_name: result.customer_name,
        phone: result.phone,
        segment: result.segment,
        message_text: result.message
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || 'Failed to send message'
      });
    }
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Failed to send message', details: error.message });
  }
});

module.exports = router;

