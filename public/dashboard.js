// Dashboard JavaScript

let currentStoreId = 1;

// Get store ID from input
function getStoreId() {
    const input = document.getElementById('storeId');
    return parseInt(input.value) || 1;
}

// Load customer data
async function loadCustomers() {
    const storeId = getStoreId();
    try {
        const response = await fetch(`/dashboard/customers?store_id=${storeId}`);
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to load customers');
        }

        // Update stats
        document.getElementById('stat-new').textContent = data.stats.NEW || 0;
        document.getElementById('stat-active').textContent = data.stats.ACTIVE || 0;
        document.getElementById('stat-at-risk').textContent = data.stats.AT_RISK || 0;
        document.getElementById('stat-churned').textContent = data.stats.CHURNED || 0;
        document.getElementById('stat-vip').textContent = data.stats.VIP || 0;

        // Update table
        const tbody = document.getElementById('customers-tbody');
        if (data.customers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty">لا توجد بيانات عملاء</td></tr>';
            return;
        }

        tbody.innerHTML = data.customers.map(customer => {
            const vipBadge = customer.is_vip ? '<span class="vip-badge">VIP</span>' : '';
            const segmentClass = customer.segment.toLowerCase().replace('_', '-');
            
            let actionButton = '';
            if (customer.segment === 'NEW') {
                actionButton = '<button class="btn-small" onclick="sendWelcomeMsg(' + customer.id + ')">إرسال رسالة ترحيب</button>';
            } else if (customer.segment === 'AT_RISK') {
                actionButton = '<button class="btn-small" onclick="sendWinBack(' + customer.id + ')">إرسال رسالة استرجاع</button>';
            } else if (customer.segment === 'CHURNED') {
                actionButton = '<button class="btn-small" onclick="sendCoupon(' + customer.id + ')">إرسال كوبون</button>';
            }

            return `
                <tr class="segment-${segmentClass}">
                    <td>${customer.name} ${vipBadge}</td>
                    <td>${customer.total_orders}</td>
                    <td>${customer.total_spent} SAR</td>
                    <td>${customer.last_order}</td>
                    <td><span class="segment-badge ${segmentClass}">${getSegmentName(customer.segment)}</span></td>
                    <td>${actionButton}</td>
                </tr>
            `;
        }).join('');
    } catch (error) {
        console.error('Error loading customers:', error);
        document.getElementById('customers-tbody').innerHTML = 
            `<tr><td colspan="6" class="error">خطأ في تحميل البيانات: ${error.message}</td></tr>`;
    }
}

// Load products
async function loadProducts() {
    const storeId = getStoreId();
    try {
        const response = await fetch(`/dashboard/products?store_id=${storeId}`);
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to load products');
        }

        const tbody = document.getElementById('products-tbody');
        if (data.products.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="empty">لا توجد منتجات</td></tr>';
            return;
        }

        tbody.innerHTML = data.products.map(product => {
            return `
                <tr>
                    <td>${product.name}</td>
                    <td>${product.sku || '-'}</td>
                    <td>
                        <input type="number" 
                               id="avg-days-${product.id}" 
                               value="${product.avg_days_to_finish}" 
                               min="1" 
                               class="input-small">
                    </td>
                    <td>
                        <input type="number" 
                               id="offset-days-${product.id}" 
                               value="${product.offset_days}" 
                               min="0" 
                               class="input-small">
                    </td>
                    <td>
                        <button class="btn-small btn-primary" 
                                onclick="saveProductSettings('${product.id}', '${product.name.replace(/'/g, "\\'")}')">
                            حفظ
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (error) {
        console.error('Error loading products:', error);
        document.getElementById('products-tbody').innerHTML = 
            `<tr><td colspan="5" class="error">خطأ في تحميل المنتجات: ${error.message}</td></tr>`;
    }
}

// Save product settings
async function saveProductSettings(productId, productName) {
    const storeId = getStoreId();
    const avgDays = parseInt(document.getElementById(`avg-days-${productId}`).value);
    const offsetDays = parseInt(document.getElementById(`offset-days-${productId}`).value);

    if (!avgDays || !offsetDays) {
        alert('يرجى إدخال قيم صحيحة');
        return;
    }

    try {
        const response = await fetch(`/settings/product/${productId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                store_id: storeId,
                product_name: productName,
                avg_days_to_finish: avgDays,
                offset_days: offsetDays
            })
        });

        const data = await response.json();
        if (data.success) {
            alert('تم حفظ الإعدادات بنجاح');
        } else {
            alert('خطأ: ' + (data.error || 'فشل الحفظ'));
        }
    } catch (error) {
        console.error('Error saving settings:', error);
        alert('خطأ في حفظ الإعدادات');
    }
}

// Sync customers
async function syncCustomers() {
    const storeId = getStoreId();
    const button = event.target;
    button.disabled = true;
    button.textContent = 'جاري المزامنة...';

    try {
        const response = await fetch('/api/sync-customers', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ store_id: storeId })
        });

        const data = await response.json();
        if (data.success) {
            alert(`تمت المزامنة بنجاح!\nتم إنشاء: ${data.created}\nتم التحديث: ${data.updated}`);
            loadData();
        } else {
            alert('خطأ: ' + (data.error || 'فشلت المزامنة'));
        }
    } catch (error) {
        console.error('Error syncing:', error);
        alert('خطأ في المزامنة');
    } finally {
        button.disabled = false;
        button.textContent = 'مزامنة العملاء';
    }
}

// Send reminders
async function sendReminders() {
    const button = event.target;
    button.disabled = true;
    button.textContent = 'جاري الإرسال...';

    try {
        const response = await fetch('/simulate/send-reminders', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();
        const statusDiv = document.getElementById('reminder-status');
        if (data.success) {
            statusDiv.innerHTML = `<div class="success">تم إرسال ${data.results.length} تذكير</div>`;
        } else {
            statusDiv.innerHTML = `<div class="error">خطأ: ${data.error}</div>`;
        }
    } catch (error) {
        console.error('Error sending reminders:', error);
        document.getElementById('reminder-status').innerHTML = 
            `<div class="error">خطأ في إرسال التذكيرات</div>`;
    } finally {
        button.disabled = false;
        button.textContent = 'إرسال التذكيرات المعلقة';
    }
}

// Calculate reminders
async function calculateReminders() {
    const storeId = getStoreId();
    const button = event.target;
    button.disabled = true;
    button.textContent = 'جاري الحساب...';

    try {
        const response = await fetch('/api/calculate-reminders', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ store_id: storeId })
        });

        const data = await response.json();
        const statusDiv = document.getElementById('reminder-status');
        if (data.success) {
            statusDiv.innerHTML = `<div class="success">تم إنشاء ${data.reminders_created} تذكير</div>`;
        } else {
            statusDiv.innerHTML = `<div class="error">خطأ: ${data.error}</div>`;
        }
    } catch (error) {
        console.error('Error calculating reminders:', error);
        document.getElementById('reminder-status').innerHTML = 
            `<div class="error">خطأ في حساب التذكيرات</div>`;
    } finally {
        button.disabled = false;
        button.textContent = 'حساب التذكيرات من الطلبات';
    }
}

// Load all data
function loadData() {
    loadCustomers();
    loadProducts();
}

// Helper functions
function getSegmentName(segment) {
    const names = {
        'NEW': 'جديد',
        'ACTIVE': 'نشط',
        'AT_RISK': 'معرض للخطر',
        'CHURNED': 'متوقف',
        'VIP': 'VIP'
    };
    return names[segment] || segment;
}

function sendWelcomeMsg(customerId) {
    alert('سيتم إرسال رسالة ترحيب للعميل (محاكاة)');
}

function sendWinBack(customerId) {
    alert('سيتم إرسال رسالة استرجاع للعميل (محاكاة)');
}

function sendCoupon(customerId) {
    alert('سيتم إرسال كوبون للعميل (محاكاة)');
}

// Load data on page load
document.addEventListener('DOMContentLoaded', () => {
    loadData();
    // Auto-refresh every 30 seconds
    setInterval(loadData, 30000);
});

