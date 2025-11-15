const db = require('../config/database');
const ZidApi = require('./zidApi');

class SegmentationService {
  constructor(storeId, accessToken) {
    this.storeId = storeId;
    this.zidApi = new ZidApi(accessToken);
  }

  // Extract product name (handle both object and string)
  extractProductName(product) {
    if (!product || !product.name) return '';
    if (typeof product.name === 'string') return product.name;
    if (typeof product.name === 'object') {
      return product.name.ar || product.name.en || '';
    }
    return '';
  }

  // Check if product is honey-related
  isHoneyProduct(product) {
    const name = this.extractProductName(product).toLowerCase();
    const honeyKeywords = ['عسل', 'honey', 'عسل سدر', 'sidr', 'عسل حبة البركة', 'black seed'];
    return honeyKeywords.some(keyword => name.includes(keyword));
  }

  async syncCustomers() {
    try {
      console.log(`[Segmentation] Starting customer sync for store ${this.storeId}...`);
      
      // Fetch all orders
      const orders = await this.zidApi.getAllOrders();
      console.log(`[Segmentation] Fetched ${orders.length} orders`);

      // Group orders by customer
      const customerData = {};

      for (const order of orders) {
        const orderData = order.order || order;
        const customer = orderData.customer;
        
        if (!customer || !customer.id) continue;

        const customerId = customer.id;
        const orderDate = new Date(orderData.created_at);
        const transactionAmount = parseFloat(orderData.transaction_amount) || 0;

        if (!customerData[customerId]) {
          customerData[customerId] = {
            zid_customer_id: customerId,
            store_id: this.storeId,
            name: customer.name || '',
            phone: customer.mobile || '',
            email: customer.email || '',
            orders: [],
            total_spent: 0,
            first_order_date: orderDate,
            last_order_date: orderDate
          };
        }

        customerData[customerId].orders.push({
          id: orderData.id,
          date: orderDate,
          amount: transactionAmount,
          products: orderData.products || []
        });

        customerData[customerId].total_spent += transactionAmount;

        if (orderDate < customerData[customerId].first_order_date) {
          customerData[customerId].first_order_date = orderDate;
        }

        if (orderDate > customerData[customerId].last_order_date) {
          customerData[customerId].last_order_date = orderDate;
        }
      }

      // Calculate metrics and segments
      const now = new Date();
      let updated = 0;
      let created = 0;

      for (const customerId in customerData) {
        const data = customerData[customerId];
        const totalOrders = data.orders.length;
        const daysSinceLastOrder = Math.floor(
          (now - data.last_order_date) / (1000 * 60 * 60 * 24)
        );

        // Determine segment
        let segment = 'NEW';
        if (totalOrders === 1 && daysSinceLastOrder <= 7) {
          segment = 'NEW';
        } else if (totalOrders >= 2 && daysSinceLastOrder <= 30) {
          segment = 'ACTIVE';
        } else if (daysSinceLastOrder > 30 && daysSinceLastOrder <= 60) {
          segment = 'AT_RISK';
        } else if (daysSinceLastOrder > 60) {
          segment = 'CHURNED';
        }

        // Check VIP status
        const isVip = totalOrders >= 5 || data.total_spent >= 500;

        // Upsert customer
        const existing = db.prepare('SELECT id FROM customers WHERE zid_customer_id = ? AND store_id = ?')
          .get(customerId, this.storeId);

        if (existing) {
          db.prepare(`
            UPDATE customers 
            SET name = ?, phone = ?, email = ?, 
                total_orders = ?, total_spent = ?, 
                first_order_date = ?, last_order_date = ?,
                days_since_last_order = ?, segment = ?, is_vip = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE zid_customer_id = ? AND store_id = ?
          `).run(
            data.name, data.phone, data.email,
            totalOrders, data.total_spent,
            data.first_order_date.toISOString(), data.last_order_date.toISOString(),
            daysSinceLastOrder, segment, isVip ? 1 : 0,
            customerId, this.storeId
          );
          updated++;
        } else {
          db.prepare(`
            INSERT INTO customers 
            (zid_customer_id, store_id, name, phone, email, 
             total_orders, total_spent, first_order_date, last_order_date,
             days_since_last_order, segment, is_vip)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            customerId, this.storeId, data.name, data.phone, data.email,
            totalOrders, data.total_spent,
            data.first_order_date.toISOString(), data.last_order_date.toISOString(),
            daysSinceLastOrder, segment, isVip ? 1 : 0
          );
          created++;
        }
      }

      console.log(`[Segmentation] Sync complete: ${created} created, ${updated} updated`);
      return { created, updated, total: Object.keys(customerData).length };
    } catch (error) {
      console.error('[Segmentation] Error syncing customers:', error);
      throw error;
    }
  }

  getCustomerStats(storeId) {
    const stats = db.prepare(`
      SELECT 
        segment,
        COUNT(*) as count,
        SUM(CASE WHEN is_vip = 1 THEN 1 ELSE 0 END) as vip_count
      FROM customers
      WHERE store_id = ?
      GROUP BY segment
    `).all(storeId);

    const result = {
      NEW: 0,
      ACTIVE: 0,
      AT_RISK: 0,
      CHURNED: 0,
      VIP: 0
    };

    stats.forEach(stat => {
      result[stat.segment] = stat.count;
    });

    // Get total VIP count
    const vipCount = db.prepare(`
      SELECT COUNT(*) as count 
      FROM customers 
      WHERE store_id = ? AND is_vip = 1
    `).get(storeId);

    result.VIP = vipCount.count;

    return result;
  }
}

module.exports = SegmentationService;

