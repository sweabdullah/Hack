const axios = require('axios');
require('dotenv').config();

class ZidApi {
  constructor(accessToken) {
    this.accessToken = accessToken;
    this.baseURL = process.env.ZID_API_BASE_URL || 'https://api.zid.sa/v1';
  }

  async _makeRequest(method, endpoint, params = {}) {
    try {
      const config = {
        method,
        url: `${this.baseURL}${endpoint}`,
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
          'X-Manager-Token': this.accessToken
        }
      };

      if (method === 'GET') {
        config.params = params;
      } else {
        config.data = params;
      }

      const response = await axios(config);
      return response.data;
    } catch (error) {
      console.error(`Zid API Error (${endpoint}):`, error.response?.data || error.message);
      throw error;
    }
  }

  async getProducts(page = 1, perPage = 50) {
    const response = await this._makeRequest('GET', '/products', {
      page,
      per_page: perPage
    });
    return response;
  }

  async getAllProducts() {
    let allProducts = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await this.getProducts(page, 50);
      if (response.payload && Array.isArray(response.payload)) {
        allProducts = allProducts.concat(response.payload);
        hasMore = response.payload.length === 50;
        page++;
      } else if (response.products && Array.isArray(response.products)) {
        allProducts = allProducts.concat(response.products);
        hasMore = response.products.length === 50;
        page++;
      } else {
        hasMore = false;
      }
    }

    return allProducts;
  }

  async getOrders(page = 1, perPage = 50) {
    const response = await this._makeRequest('GET', '/orders', {
      page,
      per_page: perPage
    });
    return response;
  }

  async getAllOrders() {
    let allOrders = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await this.getOrders(page, 50);
      if (response.orders && Array.isArray(response.orders)) {
        allOrders = allOrders.concat(response.orders);
        hasMore = response.orders.length === 50;
        page++;
      } else if (response.payload && Array.isArray(response.payload)) {
        allOrders = allOrders.concat(response.payload);
        hasMore = response.payload.length === 50;
        page++;
      } else {
        hasMore = false;
      }
    }

    return allOrders;
  }

  async getCustomers(page = 1, perPage = 50) {
    const response = await this._makeRequest('GET', '/customers', {
      page,
      per_page: perPage
    });
    return response;
  }

  async getAllCustomers() {
    let allCustomers = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await this.getCustomers(page, 50);
      if (response.customers && Array.isArray(response.customers)) {
        allCustomers = allCustomers.concat(response.customers);
        hasMore = response.customers.length === 50;
        page++;
      } else if (response.payload && Array.isArray(response.payload)) {
        allCustomers = allCustomers.concat(response.payload);
        hasMore = response.payload.length === 50;
        page++;
      } else {
        hasMore = false;
      }
    }

    return allCustomers;
  }

  async getOrder(orderId) {
    const response = await this._makeRequest('GET', `/orders/${orderId}`);
    return response;
  }
}

module.exports = ZidApi;

