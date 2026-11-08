const BACKEND_DOMAIN = 'https://xyurabckend.vercel.app';

const API_URL = BACKEND_DOMAIN + '/api/all';
const API_KEY = 'YussXySecret2024';
const POLL_INTERVAL = 15000;

const STORAGE = {
autoRefresh: 'om_auto_refresh',
sound: 'om_sound',
theme: 'om_theme',
compareRange: 'om_compare_range'
};

let allOrders = [];
let filteredOrders = [];
let currentFilter = 'all';
let currentPage = 1;
const itemsPerPage = 12;
let currentOrderId = null;
let currentOrderData = null;
let pollTimer = null;
let newOrdersCount = 0;
let previousOrderIds = new Set();
let selectedOrderIds = new Set();
let isFirstLoad = true;
let audioCtx = null;
let currentCompareRange = 'today';

function escapeHtml(text) {
if (text === null || text === undefined || text === '') return '-';
const div = document.createElement('div');
div.textContent = String(text);
return div.innerHTML;
}

function formatDateTime(dateStr) {
if (!dateStr) return '-';
try {
const date = new Date(dateStr);
if (isNaN(date.getTime())) return '-';
return date.toLocaleDateString('en-US', {
day: 'numeric', month: 'short', year: 'numeric',
hour: '2-digit', minute: '2-digit'
});
} catch (e) { return '-'; }
}

function formatRupiah(amount) {
if (amount === null || amount === undefined || amount === '') return 'Rp 0';
const num = Number(amount);
if (isNaN(num)) return 'Rp 0';
if (num >= 1000000) return 'Rp ' + (num / 1000000).toFixed(1) + 'M';
if (num >= 1000) return 'Rp ' + (num / 1000).toFixed(0) + 'K';
return 'Rp ' + num.toLocaleString('en-US');
}

function formatRupiahFull(amount) {
if (amount === null || amount === undefined || amount === '') return 'Rp 0';
const num = Number(amount);
if (isNaN(num)) return 'Rp 0';
return 'Rp ' + num.toLocaleString('en-US');
}

function getStatusKey(status) {
const s = (status || '').toLowerCase();
if (s === 'completed' || s === 'success' || s === 'sukses') return 'completed';
if (s === 'processing' || s === 'proses') return 'processing';
if (s === 'cancelled' || s === 'canceled' || s === 'failed' || s === 'gagal') return 'cancelled';
if (s === 'refunded' || s === 'refund') return 'refunded';
return 'pending';
}

function getStatusLabel(status) {
const labels = {
pending: 'Pending', processing: 'Processing', completed: 'Completed',
cancelled: 'Cancelled', refunded: 'Refunded'
};
return labels[getStatusKey(status)] || 'Pending';
}

function getStatusIcon(status) {
const icons = {
pending: 'ri-time-line', processing: 'ri-loader-4-line',
completed: 'ri-checkbox-circle-line', cancelled: 'ri-close-circle-line',
refunded: 'ri-refund-2-line'
};
return icons[getStatusKey(status)] || 'ri-time-line';
}

function showToast(message, type) {
const toast = document.getElementById('toast');
if (!toast) return;
toast.className = 'toast show ' + (type || 'info');
let icon = 'ri-information-line';
if (type === 'success') icon = 'ri-checkbox-circle-line';
if (type === 'error') icon = 'ri-error-warning-line';
toast.innerHTML = '<i class="' + icon + '"></i><span>' + escapeHtml(message) + '</span>';
clearTimeout(toast._timer);
toast._timer = setTimeout(function() { toast.classList.remove('show'); }, 3000);
}

function playSound() {
if (localStorage.getItem(STORAGE.sound) === 'false') return;
try {
if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const now = audioCtx.currentTime;
const osc = audioCtx.createOscillator();
const gain = audioCtx.createGain();
osc.connect(gain);
gain.connect(audioCtx.destination);
osc.type = 'sine';
osc.frequency.setValueAtTime(880, now);
osc.frequency.exponentialRampToValueAtTime(1320, now + 0.1);
gain.gain.setValueAtTime(0.3, now);
gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
osc.start(now);
osc.stop(now + 0.5);
} catch (e) {}
}

async function apiCall(action, data) {
const body = { action: action };
if (data) body.data = data;
const response = await fetch(API_URL, {
method: 'POST',
headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
body: JSON.stringify(body)
});
if (!response.ok) throw new Error('HTTP ' + response.status);
return await response.json();
}

function detectNewOrders(newOrders) {
if (isFirstLoad) {
previousOrderIds = new Set(newOrders.map(function(o) { return o.id; }));
isFirstLoad = false;
return 0;
}
const newIds = [];
newOrders.forEach(function(o) {
if (!previousOrderIds.has(o.id)) newIds.push(o.id);
});
previousOrderIds = new Set(newOrders.map(function(o) { return o.id; }));
return newIds.length;
}

function updateNewBadge(count) {
const badge = document.getElementById('newBadge');
if (!badge) return;
if (count > 0) {
newOrdersCount += count;
badge.textContent = newOrdersCount > 99 ? '99+' : newOrdersCount;
badge.style.display = 'block';
} else {
badge.style.display = 'none';
}
}

function clearNewBadge() {
newOrdersCount = 0;
const badge = document.getElementById('newBadge');
if (badge) badge.style.display = 'none';
}

async function fetchOrders(showToastOnNew) {
try {
const result = await apiCall('order_list', { limit: 200 });
if (result.success && Array.isArray(result.data)) {
allOrders = result.data.sort(function(a, b) {
const dateA = new Date(a.created_at || 0).getTime();
const dateB = new Date(b.created_at || 0).getTime();
return dateB - dateA;
});
const newCount = detectNewOrders(allOrders);
if (newCount > 0 && !isFirstLoad) {
updateNewBadge(newCount);
playSound();
if (showToastOnNew) showToast(newCount + ' new order' + (newCount > 1 ? 's' : ''), 'info');
}
} else {
allOrders = [];
}
renderAll();
updateCompare();
} catch (error) {
console.error('Error fetching orders:', error);
showError();
}
}

function getDateRangeOrders(range) {
const now = new Date();
const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
let startDate, endDate;

if (range === 'today') {
startDate = today;
endDate = new Date(today);
endDate.setDate(endDate.getDate() + 1);
} else if (range === '7d') {
startDate = new Date(today);
startDate.setDate(startDate.getDate() - 6);
endDate = new Date(today);
endDate.setDate(endDate.getDate() + 1);
} else if (range === '30d') {
startDate = new Date(today);
startDate.setDate(startDate.getDate() - 29);
endDate = new Date(today);
endDate.setDate(endDate.getDate() + 1);
}

return allOrders.filter(function(o) {
if (!o.created_at) return false;
const d = new Date(o.created_at);
if (isNaN(d.getTime())) return false;
return d >= startDate && d < endDate;
});
}

function getPreviousPeriodOrders(range) {
const now = new Date();
const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
let startDate, endDate;

if (range === 'today') {
startDate = new Date(today);
startDate.setDate(startDate.getDate() - 1);
endDate = new Date(today);
} else if (range === '7d') {
startDate = new Date(today);
startDate.setDate(startDate.getDate() - 13);
endDate = new Date(today);
endDate.setDate(endDate.getDate() - 6);
} else if (range === '30d') {
startDate = new Date(today);
startDate.setDate(startDate.getDate() - 59);
endDate = new Date(today);
endDate.setDate(endDate.getDate() - 29);
}

return allOrders.filter(function(o) {
if (!o.created_at) return false;
const d = new Date(o.created_at);
if (isNaN(d.getTime())) return false;
return d >= startDate && d < endDate;
});
}

function calcChange(current, previous) {
if (previous === 0 && current === 0) return { percent: 0, direction: 'equal' };
if (previous === 0) return { percent: 100, direction: 'up' };
const diff = ((current - previous) / previous) * 100;
return {
percent: Math.abs(Math.round(diff)),
direction: diff > 0 ? 'up' : (diff < 0 ? 'down' : 'equal')
};
}

function updateCompare() {
const current = getDateRangeOrders(currentCompareRange);
const previous = getPreviousPeriodOrders(currentCompareRange);

const currCount = current.length;
const prevCount = previous.length;
const currRev = current
.filter(function(o) { return getStatusKey(o.status) === 'completed'; })
.reduce(function(s, o) { return s + (Number(o.total_price) || 0); }, 0);
const prevRev = previous
.filter(function(o) { return getStatusKey(o.status) === 'completed'; })
.reduce(function(s, o) { return s + (Number(o.total_price) || 0); }, 0);

const countChange = calcChange(currCount, prevCount);
const revChange = calcChange(currRev, prevRev);

const compareText = document.getElementById('compareText');
if (compareText) {
const arrow = countChange.direction === 'up' ? '↑' : (countChange.direction === 'down' ? '↓' : '→');
const revArrow = revChange.direction === 'up' ? '↑' : (revChange.direction === 'down' ? '↓' : '→');
compareText.innerHTML = currCount + ' orders ' + arrow + ' ' + countChange.percent + '% · ' +
formatRupiah(currRev) + ' ' + revArrow + ' ' + revChange.percent + '%';
}

updateHeroTrends(current, previous);
}

function updateHeroTrends(current, previous) {
const currCompleted = current.filter(function(o) { return getStatusKey(o.status) === 'completed'; }).length;
const prevCompleted = previous.filter(function(o) { return getStatusKey(o.status) === 'completed'; }).length;

const currPending = current.filter(function(o) { return getStatusKey(o.status) === 'pending'; }).length;
const prevPending = previous.filter(function(o) { return getStatusKey(o.status) === 'pending'; }).length;

const currRev = current
.filter(function(o) { return getStatusKey(o.status) === 'completed'; })
.reduce(function(s, o) { return s + (Number(o.total_price) || 0); }, 0);
const prevRev = previous
.filter(function(o) { return getStatusKey(o.status) === 'completed'; })
.reduce(function(s, o) { return s + (Number(o.total_price) || 0); }, 0);

setTrend('statTotalTrend', calcChange(current.length, previous.length));
setTrend('statPendingTrend', calcChange(currPending, prevPending));
setTrend('statSuccessTrend', calcChange(currCompleted, prevCompleted));
setTrend('statRevenueTrend', calcChange(currRev, prevRev));
}

function setTrend(id, change) {
const el = document.getElementById(id);
if (!el) return;
const icon = change.direction === 'up' ? 'ri-arrow-up-line' :
change.direction === 'down' ? 'ri-arrow-down-line' : 'ri-arrow-right-line';
el.className = 'hero-stat-trend ' + change.direction;
el.innerHTML = '<i class="' + icon + '"></i> <span>' + change.percent + '%</span>';
}

function updateStats() {
const total = allOrders.length;
const pending = allOrders.filter(function(o) { return getStatusKey(o.status) === 'pending'; }).length;
const completed = allOrders.filter(function(o) { return getStatusKey(o.status) === 'completed'; }).length;
const revenue = allOrders
.filter(function(o) { return getStatusKey(o.status) === 'completed'; })
.reduce(function(sum, o) { return sum + (Number(o.total_price) || 0); }, 0);

const statTotal = document.getElementById('statTotal');
const statPending = document.getElementById('statPending');
const statSuccess = document.getElementById('statSuccess');
const statRevenue = document.getElementById('statRevenue');

if (statTotal) statTotal.textContent = total;
if (statPending) statPending.textContent = pending;
if (statSuccess) statSuccess.textContent = completed;
if (statRevenue) statRevenue.textContent = formatRupiah(revenue);
}

function showError() {
const loadingState = document.getElementById('loadingState');
if (loadingState) loadingState.style.display = 'none';
const emptyState = document.getElementById('emptyState');
if (emptyState) {
emptyState.style.display = 'flex';
emptyState.querySelector('i').className = 'ri-error-warning-line';
emptyState.querySelector('p').textContent = 'Failed to load data';
emptyState.querySelector('span').textContent = 'Check your internet connection';
}
}

function renderAll() {
updateStats();
applyFilter();
}

function applyFilter() {
const searchInput = document.getElementById('searchInput');
const dateFromEl = document.getElementById('dateFrom');
const dateToEl = document.getElementById('dateTo');
const sortSelectEl = document.getElementById('sortSelect');

const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
const dateFrom = dateFromEl ? dateFromEl.value : '';
const dateTo = dateToEl ? dateToEl.value : '';
const sortBy = sortSelectEl ? sortSelectEl.value : 'newest';

filteredOrders = allOrders.filter(function(order) {
const statusKey = getStatusKey(order.status);
if (currentFilter !== 'all' && statusKey !== currentFilter) return false;

if (searchTerm) {
const searchStr = [
order.order_code, order.id, order.buyer_name, order.buyer_account,
order.product_name, order.account_email, order.phone_number, order.telegram_name
].filter(Boolean).join(' ').toLowerCase();
if (searchStr.indexOf(searchTerm) === -1) return false;
}

if (dateFrom || dateTo) {
const orderDate = order.created_at ? new Date(order.created_at) : null;
if (orderDate && !isNaN(orderDate.getTime())) {
const orderDateStr = orderDate.toISOString().slice(0, 10);
if (dateFrom && orderDateStr < dateFrom) return false;
if (dateTo && orderDateStr > dateTo) return false;
}
}
return true;
});

filteredOrders.sort(function(a, b) {
const priceA = Number(a.total_price) || 0;
const priceB = Number(b.total_price) || 0;
const dateA = new Date(a.created_at || 0).getTime();
const dateB = new Date(b.created_at || 0).getTime();
switch (sortBy) {
case 'oldest': return dateA - dateB;
case 'priceHigh': return priceB - priceA;
case 'priceLow': return priceA - priceB;
default: return dateB - dateA;
}
});

currentPage = 1;
renderList();
}

function getOrderActionButtons(order) {
const statusKey = getStatusKey(order.status);
const waNumber = (order.phone_number || '').replace(/\D/g, '');
const orderId = escapeHtml(order.id);
let waBtn = '';

if (waNumber && waNumber.length >= 10) {
let cleanWA = waNumber;
if (cleanWA.startsWith('0')) cleanWA = '62' + cleanWA.slice(1);
if (!cleanWA.startsWith('62')) cleanWA = '62' + cleanWA;
waBtn = '<button type="button" class="quick-btn wa" data-wa="' + cleanWA + '" data-order-id="' + orderId + '" title="WhatsApp"><i class="ri-whatsapp-line"></i></button>';
}

if (statusKey === 'pending') {
return waBtn +
'<button type="button" class="quick-btn warning" data-action="processing" data-order-id="' + orderId + '"><i class="ri-loader-4-line"></i> Process</button>' +
'<button type="button" class="quick-btn success" data-action="completed" data-order-id="' + orderId + '"><i class="ri-check-line"></i> Complete</button>';
} else if (statusKey === 'processing') {
return waBtn +
'<button type="button" class="quick-btn success" data-action="completed" data-order-id="' + orderId + '"><i class="ri-check-line"></i> Complete</button>' +
'<button type="button" class="quick-btn danger" data-action="cancelled" data-order-id="' + orderId + '"><i class="ri-close-line"></i></button>';
} else {
return waBtn +
'<button type="button" class="quick-btn blue" data-action="processing" data-order-id="' + orderId + '"><i class="ri-refresh-line"></i> Reopen</button>' +
'<button type="button" class="quick-btn ghost" data-action="view" data-order-id="' + orderId + '" title="Details"><i class="ri-eye-line"></i></button>';
}
}

function renderList() {
const loadingState = document.getElementById('loadingState');
const emptyState = document.getElementById('emptyState');
const orderList = document.getElementById('orderList');
const pagination = document.getElementById('pagination');

if (loadingState) loadingState.style.display = 'none';
if (!orderList) return;

if (filteredOrders.length === 0) {
if (emptyState) {
emptyState.style.display = 'flex';
emptyState.querySelector('i').className = 'ri-inbox-archive-line';
emptyState.querySelector('p').textContent = 'No orders yet';
emptyState.querySelector('span').textContent = 'Data will appear automatically';
}
orderList.innerHTML = '';
if (pagination) pagination.style.display = 'none';
updateBulkActions();
return;
}

if (emptyState) emptyState.style.display = 'none';

const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);
if (currentPage > totalPages) currentPage = totalPages;
if (currentPage < 1) currentPage = 1;

const startIndex = (currentPage - 1) * itemsPerPage;
const endIndex = startIndex + itemsPerPage;
const pageOrders = filteredOrders.slice(startIndex, endIndex);

orderList.innerHTML = pageOrders.map(function(order) {
const statusKey = getStatusKey(order.status);
const statusLabel = getStatusLabel(order.status);
const statusIcon = getStatusIcon(order.status);
const isSelected = selectedOrderIds.has(order.id);

return '<div class="order-card ' + statusKey + (isSelected ? ' selected' : '') + '" data-order-id="' + escapeHtml(order.id) + '">' +
'<label class="order-card-checkbox" onclick="event.stopPropagation();">' +
'<input type="checkbox" class="order-checkbox" data-order-id="' + escapeHtml(order.id) + '"' + (isSelected ? ' checked' : '') + '>' +
'<span class="checkmark"></span>' +
'</label>' +
'<div class="order-header">' +
'<span class="order-code">' + escapeHtml(order.order_code || '-') + '</span>' +
'<span class="order-badge badge-' + statusKey + '"><i class="' + statusIcon + '"></i> ' + statusLabel + '</span>' +
'</div>' +
'<div class="order-product">' + escapeHtml(order.product_name || 'Digital Product') + '</div>' +
'<div class="order-buyer"><i class="ri-user-3-line"></i><span><strong>' + escapeHtml(order.buyer_name || '-') + '</strong></span></div>' +
'<div class="order-meta">' +
'<div class="order-meta-item">' +
'<span class="order-meta-label">Email</span>' +
'<span class="order-meta-value mono">' + escapeHtml(order.account_email || '-') + '</span>' +
'</div>' +
'<div class="order-meta-item">' +
'<span class="order-meta-label">Phone</span>' +
'<span class="order-meta-value">' + escapeHtml(order.phone_number || '-') + '</span>' +
'</div>' +
'</div>' +
'<div class="order-footer">' +
'<span class="order-price">' + formatRupiah(order.total_price || order.sell_price || 0) + '</span>' +
'<span class="order-time"><i class="ri-time-line"></i> ' + formatDateTime(order.created_at) + '</span>' +
'</div>' +
'<div class="order-quick-actions" onclick="event.stopPropagation();">' +
getOrderActionButtons(order) +
'</div>' +
'</div>';
}).join('');

orderList.querySelectorAll('.order-card').forEach(function(card) {
card.addEventListener('click', function(e) {
if (e.target.closest('.order-card-checkbox')) return;
if (e.target.closest('.order-quick-actions')) return;
openDetail(card.dataset.orderId);
});
});

orderList.querySelectorAll('.order-checkbox').forEach(function(cb) {
cb.addEventListener('change', function(e) {
e.stopPropagation();
const id = cb.dataset.orderId;
if (cb.checked) {
selectedOrderIds.add(id);
const card = cb.closest('.order-card');
if (card) card.classList.add('selected');
} else {
selectedOrderIds.delete(id);
const card = cb.closest('.order-card');
if (card) card.classList.remove('selected');
}
updateSelectAllState();
updateBulkActions();
});
});

orderList.querySelectorAll('.quick-btn').forEach(function(btn) {
btn.addEventListener('click', async function(e) {
e.preventDefault();
e.stopPropagation();
e.stopImmediatePropagation();

const action = btn.dataset.action;
const orderId = btn.dataset.orderId;

if (btn.dataset.wa) {
const order = allOrders.find(function(o) { return o.id === orderId; });
if (!order) return;
const buyerName = order.buyer_name || 'Customer';
const orderCode = order.order_code || '';
const productName = order.product_name || '';
const message = 'Halo ' + buyerName + '!\n\n' +
'Berikut Pesanan kamu di YussXy Store:\n' +
'Order: ' + orderCode + '\n' +
'Produk: ' + productName + '\n\n' +
'Telah Selesai dan berikut data akun kamu\n\n\n' +
'(di isi admin)\n\n\n' +
'terimakasih telah order';
window.open('https://wa.me/' + btn.dataset.wa + '?text=' + encodeURIComponent(message), '_blank');
return;
}

if (action === 'view') {
openDetail(orderId);
return;
}

const originalHtml = btn.innerHTML;
const parent = btn.closest('.order-quick-actions');
const allBtns = parent ? parent.querySelectorAll('.quick-btn') : [btn];
allBtns.forEach(function(b) { b.disabled = true; });
btn.innerHTML = '<div class="loading-spinner" style="width:12px;height:12px;border-width:2px;"></div>';

try {
const result = await apiCall('order_update_status', { id: orderId, status: action });
if (!result.success) throw new Error(result.message || 'Failed');
showToast('Status updated to ' + action, 'success');
await fetchOrders();
} catch (err) {
showToast(err.message || 'Error', 'error');
allBtns.forEach(function(b) { b.disabled = false; });
btn.innerHTML = originalHtml;
}
});
});

if (totalPages > 1) {
if (pagination) {
pagination.style.display = 'flex';
const pageInfo = document.getElementById('pageInfo');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
if (pageInfo) pageInfo.textContent = currentPage + ' / ' + totalPages;
if (prevBtn) prevBtn.disabled = currentPage === 1;
if (nextBtn) nextBtn.disabled = currentPage === totalPages;
}
} else {
if (pagination) pagination.style.display = 'none';
}

updateSelectAllState();
updateBulkActions();
}

function updateSelectAllState() {
const selectAll = document.getElementById('selectAllCheckbox');
if (!selectAll) return;
const currentPageOrders = filteredOrders.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
const selectedOnPage = currentPageOrders.filter(function(o) { return selectedOrderIds.has(o.id); }).length;

if (selectedOnPage === 0) {
selectAll.checked = false;
selectAll.indeterminate = false;
} else if (selectedOnPage === currentPageOrders.length) {
selectAll.checked = true;
selectAll.indeterminate = false;
} else {
selectAll.checked = false;
selectAll.indeterminate = true;
}
}

function updateBulkActions() {
const bulkActions = document.getElementById('bulkActions');
const bulkCount = document.getElementById('bulkCount');
if (!bulkActions) return;
if (selectedOrderIds.size > 0) {
bulkActions.style.display = 'flex';
if (bulkCount) bulkCount.textContent = selectedOrderIds.size;
} else {
bulkActions.style.display = 'none';
}
}

function showConfirm(options) {
return new Promise(function(resolve) {
const modal = document.getElementById('confirmModal');
const icon = document.getElementById('confirmIcon');
const title = document.getElementById('confirmTitle');
const message = document.getElementById('confirmMessage');
const okBtn = document.getElementById('confirmOkBtn');
const cancelBtn = document.getElementById('confirmCancelBtn');

if (!modal) { resolve(false); return; }

icon.className = 'confirm-icon ' + (options.type || 'danger');
icon.innerHTML = '<i class="' + (options.icon || 'ri-delete-bin-line') + '"></i>';
title.textContent = options.title || 'Are you sure?';
message.textContent = options.message || 'This action cannot be undone.';
okBtn.textContent = options.okText || 'Yes, Continue';
okBtn.className = 'confirm-btn ' + (options.okClass || 'danger');

modal.classList.add('show');

function cleanup() {
modal.classList.remove('show');
okBtn.removeEventListener('click', onOk);
cancelBtn.removeEventListener('click', onCancel);
modal.removeEventListener('click', onOverlay);
document.removeEventListener('keydown', onEsc);
}
function onOk() { cleanup(); resolve(true); }
function onCancel() { cleanup(); resolve(false); }
function onOverlay(e) { if (e.target === modal) { cleanup(); resolve(false); } }
function onEsc(e) { if (e.key === 'Escape') { cleanup(); resolve(false); } }

okBtn.addEventListener('click', onOk);
cancelBtn.addEventListener('click', onCancel);
modal.addEventListener('click', onOverlay);
document.addEventListener('keydown', onEsc);
});
}

async function openDetail(orderId) {
currentOrderId = orderId;
const modal = document.getElementById('detailModal');
const modalBody = document.getElementById('modalBody');
const modalOrderCode = document.getElementById('modalOrderCode');

if (!modal) return;

modalBody.innerHTML = '<div style="text-align:center;padding:40px;"><div class="loading-spinner" style="margin:0 auto 16px;"></div><p style="color:var(--text-muted);font-size:13px;">Loading...</p></div>';
modalOrderCode.textContent = 'Loading...';
modal.classList.add('show');

try {
const result = await apiCall('order_detail', { id: orderId });
let orderData = null;
if (result.success && Array.isArray(result.data) && result.data.length > 0) {
orderData = result.data[0].order_data || result.data[0];
} else if (result.success && result.data) {
orderData = result.data;
}
if (!orderData) {
modalBody.innerHTML = '<div class="empty-state"><i class="ri-error-warning-line"></i><p>Not found</p></div>';
return;
}
currentOrderData = orderData;
modalOrderCode.textContent = orderData.order_code || '-';
renderDetailModal(orderData);
} catch (error) {
modalBody.innerHTML = '<div class="empty-state"><i class="ri-error-warning-line"></i><p>Failed to load</p><span>' + escapeHtml(error.message) + '</span></div>';
}
}

function makeCopyable(value) {
if (!value || value === '-') return '<span class="detail-item-value">-</span>';
return '<span class="detail-item-value copyable" data-copy="' + escapeHtml(value) + '">' + escapeHtml(value) + '</span>';
}

function renderDetailModal(order) {
const modalBody = document.getElementById('modalBody');
const statusKey = getStatusKey(order.status);
const statusLabel = getStatusLabel(order.status);
const statusIcon = getStatusIcon(order.status);
const waNumber = (order.phone_number || '').replace(/\D/g, '');

let actionsHtml = '';
if (statusKey === 'pending') {
actionsHtml =
'<button type="button" class="action-btn warning" data-action="processing"><i class="ri-loader-4-line"></i> Process</button>' +
'<button type="button" class="action-btn success" data-action="completed"><i class="ri-check-line"></i> Complete</button>' +
'<button type="button" class="action-btn danger" data-action="cancelled"><i class="ri-close-line"></i> Cancel</button>';
} else if (statusKey === 'processing') {
actionsHtml =
'<button type="button" class="action-btn success" data-action="completed"><i class="ri-check-line"></i> Complete</button>' +
'<button type="button" class="action-btn danger" data-action="cancelled"><i class="ri-close-line"></i> Cancel</button>';
} else {
actionsHtml =
'<button type="button" class="action-btn primary" data-action="processing"><i class="ri-refresh-line"></i> Reopen</button>' +
'<button type="button" class="action-btn ghost" data-action="delete"><i class="ri-delete-bin-line"></i> Delete</button>';
}

if (waNumber && waNumber.length >= 10) {
let cleanWA = waNumber;
if (cleanWA.startsWith('0')) cleanWA = '62' + cleanWA.slice(1);
if (!cleanWA.startsWith('62')) cleanWA = '62' + cleanWA;
actionsHtml = '<button type="button" class="action-btn wa" data-wa="' + cleanWA + '"><i class="ri-whatsapp-line"></i></button>' + actionsHtml;
}

modalBody.innerHTML =
'<div class="detail-section">' +
'<div class="detail-section-title"><i class="ri-information-line"></i> Order Info</div>' +
'<div class="detail-grid">' +
'<div class="detail-item full">' +
'<span class="detail-item-label">Status</span>' +
'<span class="badge-status status-' + statusKey + '"><i class="' + statusIcon + '"></i> ' + statusLabel + '</span>' +
'</div>' +
'<div class="detail-item">' +
'<span class="detail-item-label">Order Code</span>' +
makeCopyable(order.order_code) +
'</div>' +
'<div class="detail-item">' +
'<span class="detail-item-label">Date</span>' +
'<span class="detail-item-value">' + formatDateTime(order.created_at) + '</span>' +
'</div>' +
'<div class="detail-item full">' +
'<span class="detail-item-label">Product</span>' +
'<span class="detail-item-value">' + escapeHtml(order.product_name || '-') + '</span>' +
'</div>' +
'</div>' +
'</div>' +

'<div class="detail-section">' +
'<div class="detail-section-title"><i class="ri-user-line"></i> Buyer</div>' +
'<div class="detail-grid">' +
'<div class="detail-item">' +
'<span class="detail-item-label">Name</span>' +
'<span class="detail-item-value">' + escapeHtml(order.buyer_name || '-') + '</span>' +
'</div>' +
'<div class="detail-item">' +
'<span class="detail-item-label">Account</span>' +
makeCopyable(order.buyer_account) +
'</div>' +
'<div class="detail-item">' +
'<span class="detail-item-label">Telegram</span>' +
'<span class="detail-item-value">' + escapeHtml(order.telegram_name || '-') + '</span>' +
'</div>' +
'<div class="detail-item">' +
'<span class="detail-item-label">Phone</span>' +
makeCopyable(order.phone_number) +
'</div>' +
'</div>' +
'</div>' +

'<div class="detail-section">' +
'<div class="detail-section-title"><i class="ri-key-2-line"></i> Account</div>' +
'<div class="detail-grid">' +
'<div class="detail-item full">' +
'<span class="detail-item-label">Email</span>' +
makeCopyable(order.account_email) +
'</div>' +
'<div class="detail-item full">' +
'<span class="detail-item-label">Password</span>' +
(order.account_password ? '<span class="detail-item-value password copyable" data-copy="' + escapeHtml(order.account_password) + '">' + escapeHtml(order.account_password) + '</span>' : '<span class="detail-item-value">-</span>') +
'</div>' +
'</div>' +
'</div>' +

'<div class="detail-section">' +
'<div class="detail-section-title"><i class="ri-money-dollar-circle-line"></i> Price</div>' +
'<div class="detail-grid">' +
'<div class="detail-item">' +
'<span class="detail-item-label">Sell Price</span>' +
'<span class="detail-item-value money">' + formatRupiahFull(order.sell_price || 0) + '</span>' +
'</div>' +
'<div class="detail-item">' +
'<span class="detail-item-label">Quantity</span>' +
'<span class="detail-item-value">' + (order.quantity || 1) + 'x</span>' +
'</div>' +
'<div class="detail-item full">' +
'<span class="detail-item-label">Total</span>' +
'<span class="detail-item-value money">' + formatRupiahFull(order.total_price || 0) + '</span>' +
'</div>' +
'</div>' +
'</div>' +

(order.notes ?
'<div class="detail-section">' +
'<div class="detail-section-title"><i class="ri-file-text-line"></i> Notes</div>' +
'<div class="detail-item full">' +
'<span class="detail-item-value">' + escapeHtml(order.notes) + '</span>' +
'</div>' +
'</div>' : '') +

'<div class="detail-actions" id="detailActions">' + actionsHtml + '</div>';

attachActionListeners();
attachCopyListeners();
}

function attachActionListeners() {
const container = document.getElementById('detailActions');
if (!container) return;
container.querySelectorAll('.action-btn').forEach(function(btn) {
btn.addEventListener('click', async function(e) {
e.preventDefault();
e.stopPropagation();

if (btn.dataset.wa) {
const buyerName = (currentOrderData && currentOrderData.buyer_name) || 'Customer';
const orderCode = (currentOrderData && currentOrderData.order_code) || '';
const productName = (currentOrderData && currentOrderData.product_name) || '';
const message = 'Halo ' + buyerName + '!\n\n' +
'Berikut Pesanan kamu di YussXy Store:\n' +
'Order: ' + orderCode + '\n' +
'Produk: ' + productName + '\n\n' +
'Telah Selesai dan berikut data akun kamu\n\n\n' +
'(di isi admin)\n\n\n' +
'terimakasih telah order';
window.open('https://wa.me/' + btn.dataset.wa + '?text=' + encodeURIComponent(message), '_blank');
return;
}

const action = btn.dataset.action;
const allBtns = container.querySelectorAll('.action-btn');
allBtns.forEach(function(b) { b.disabled = true; });

try {
if (action === 'delete') await handleDelete();
else await handleUpdateStatus(action);
} catch (error) {
showToast(error.message || 'Error', 'error');
allBtns.forEach(function(b) { b.disabled = false; });
}
});
});
}

function attachCopyListeners() {
document.querySelectorAll('.copyable').forEach(function(el) {
el.addEventListener('click', function(e) {
e.stopPropagation();
const value = el.dataset.copy;
if (!value) return;
navigator.clipboard.writeText(value).then(function() {
el.classList.add('copied');
showToast('Copied!', 'success');
setTimeout(function() { el.classList.remove('copied'); }, 1500);
}).catch(function() { showToast('Failed to copy', 'error'); });
});
});
}

async function handleUpdateStatus(newStatus) {
if (!currentOrderId) return;
const result = await apiCall('order_update_status', { id: currentOrderId, status: newStatus });
if (!result.success) throw new Error(result.message || 'Failed');
showToast('Status: ' + newStatus, 'success');
closeModal();
await fetchOrders();
}

async function handleDelete() {
if (!currentOrderId) return;
const ok = await showConfirm({
type: 'danger',
icon: 'ri-delete-bin-line',
title: 'Delete Order?',
message: 'This order will be permanently deleted.',
okText: 'Yes, Delete'
});
if (!ok) {
const container = document.getElementById('detailActions');
if (container) container.querySelectorAll('.action-btn').forEach(function(b) { b.disabled = false; });
return;
}
const result = await apiCall('order_delete', { id: currentOrderId });
if (!result.success) throw new Error(result.message || 'Failed');
showToast('Order deleted', 'success');
closeModal();
await fetchOrders();
}

function closeModal() {
const modal = document.getElementById('detailModal');
if (modal) modal.classList.remove('show');
currentOrderId = null;
currentOrderData = null;
}

async function bulkDelete() {
if (selectedOrderIds.size === 0) return;
const ok = await showConfirm({
type: 'danger',
icon: 'ri-delete-bin-line',
title: 'Delete ' + selectedOrderIds.size + ' Orders?',
message: 'All selected orders will be permanently deleted.',
okText: 'Yes, Delete All'
});
if (!ok) return;

const ids = Array.from(selectedOrderIds);
let successCount = 0;
let failCount = 0;
const bulkBtn = document.getElementById('bulkDeleteBtn');
if (bulkBtn) {
bulkBtn.disabled = true;
bulkBtn.innerHTML = '<div class="loading-spinner" style="width:12px;height:12px;border-width:2px;"></div>';
}

for (let i = 0; i < ids.length; i++) {
try {
const result = await apiCall('order_delete', { id: ids[i] });
if (result.success) successCount++;
else failCount++;
} catch (e) { failCount++; }
}

selectedOrderIds.clear();
if (bulkBtn) {
bulkBtn.disabled = false;
bulkBtn.innerHTML = '<i class="ri-delete-bin-line"></i>';
}

if (failCount === 0) showToast(successCount + ' orders deleted', 'success');
else showToast(successCount + ' deleted, ' + failCount + ' failed', 'error');
await fetchOrders();
}

async function bulkComplete() {
if (selectedOrderIds.size === 0) return;
const ok = await showConfirm({
type: 'warning',
icon: 'ri-check-line',
title: 'Complete ' + selectedOrderIds.size + ' Orders?',
message: 'All selected orders will be marked as completed.',
okText: 'Yes, Complete All',
okClass: 'success'
});
if (!ok) return;

const ids = Array.from(selectedOrderIds);
let successCount = 0;
let failCount = 0;
const bulkBtn = document.getElementById('bulkCompleteBtn');
if (bulkBtn) {
bulkBtn.disabled = true;
bulkBtn.innerHTML = '<div class="loading-spinner" style="width:12px;height:12px;border-width:2px;"></div>';
}

for (let i = 0; i < ids.length; i++) {
try {
const result = await apiCall('order_update_status', { id: ids[i], status: 'completed' });
if (result.success) successCount++;
else failCount++;
} catch (e) { failCount++; }
}

selectedOrderIds.clear();
if (bulkBtn) {
bulkBtn.disabled = false;
bulkBtn.innerHTML = '<i class="ri-check-line"></i> Complete';
}

if (failCount === 0) showToast(successCount + ' orders completed', 'success');
else showToast(successCount + ' completed, ' + failCount + ' failed', 'error');
await fetchOrders();
}

function startPolling() {
if (pollTimer) clearInterval(pollTimer);
if (localStorage.getItem(STORAGE.autoRefresh) === 'false') return;
pollTimer = setInterval(function() { fetchOrders(true); }, POLL_INTERVAL);
}

function stopPolling() {
if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

async function loadStats() {
const statsBody = document.getElementById('statsBody');
if (!statsBody) return;
statsBody.innerHTML = '<div class="stats-loading"><div class="loading-spinner"></div><p>Loading...</p></div>';
try {
const summaryRes = await apiCall('order_summary');
const dailyRes = await apiCall('order_daily');
renderStats(summaryRes, dailyRes);
} catch (error) {
statsBody.innerHTML = '<div class="stats-empty"><i class="ri-error-warning-line"></i><p>Failed</p><span>' + escapeHtml(error.message) + '</span></div>';
}
}

function renderStats(summaryRes, dailyRes) {
const statsBody = document.getElementById('statsBody');
const summary = (summaryRes && summaryRes.success && summaryRes.data) ? summaryRes.data : {};
const daily = (dailyRes && dailyRes.success && Array.isArray(dailyRes.data)) ? dailyRes.data : [];

const totalOrders = summary.total_orders || 0;
const pendingOrders = summary.pending_orders || 0;
const processingOrders = summary.processing_orders || 0;
const completedOrders = summary.completed_orders || 0;
const cancelledOrders = summary.cancelled_orders || 0;
const totalRevenue = summary.total_revenue || 0;
const uniqueBuyers = summary.unique_buyers || 0;

let html = '<div class="stats-summary-grid">' +
'<div class="stats-summary-item">' +
'<div class="stats-summary-icon blue"><i class="ri-shopping-bag-3-line"></i></div>' +
'<div class="stats-summary-info">' +
'<span class="stats-summary-label">Total Orders</span>' +
'<span class="stats-summary-value">' + totalOrders + '</span>' +
'</div>' +
'</div>' +
'<div class="stats-summary-item">' +
'<div class="stats-summary-icon purple"><i class="ri-user-line"></i></div>' +
'<div class="stats-summary-info">' +
'<span class="stats-summary-label">Unique Buyers</span>' +
'<span class="stats-summary-value">' + uniqueBuyers + '</span>' +
'</div>' +
'</div>' +
'<div class="stats-summary-item full">' +
'<div class="stats-summary-icon green"><i class="ri-money-dollar-circle-line"></i></div>' +
'<div class="stats-summary-info">' +
'<span class="stats-summary-label">Total Revenue</span>' +
'<span class="stats-summary-value money">' + formatRupiahFull(totalRevenue) + '</span>' +
'</div>' +
'</div>' +
'</div>';

html += '<div class="stats-section-title"><i class="ri-pie-chart-2-line"></i> Order Status</div><div class="stats-progress-list">';

const statusItems = [
{ label: 'Pending', count: pendingOrders, color: 'amber' },
{ label: 'Processing', count: processingOrders, color: 'blue' },
{ label: 'Completed', count: completedOrders, color: 'green' },
{ label: 'Cancelled', count: cancelledOrders, color: 'red' }
];

const maxCount = Math.max(totalOrders, 1);

statusItems.forEach(function(item) {
const percent = totalOrders > 0 ? (item.count / maxCount) * 100 : 0;
html += '<div class="stats-progress-item">' +
'<div class="stats-progress-header">' +
'<span class="stats-progress-label">' + item.label + '</span>' +
'<span class="stats-progress-count">' + item.count + '</span>' +
'</div>' +
'<div class="stats-progress-bar"><div class="stats-progress-fill ' + item.color + '" style="width:' + percent + '%"></div></div>' +
'</div>';
});

html += '</div>';

if (daily.length > 0) {
const recentDaily = daily.slice(0, 10);
html += '<div class="stats-section-title"><i class="ri-calendar-line"></i> Daily (Last 10 Days)</div><div class="stats-daily-list">';

recentDaily.forEach(function(day) {
const dateObj = new Date(day.purchase_date);
const dateStr = isNaN(dateObj.getTime())
? day.purchase_date
: dateObj.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });

html += '<div class="stats-daily-item">' +
'<div class="stats-daily-date">' +
'<strong>' + escapeHtml(dateStr) + '</strong>' +
'<span>' + (day.total_orders || 0) + ' orders · ' + (day.completed || 0) + ' completed</span>' +
'</div>' +
'<div class="stats-daily-meta">' +
'<div class="stats-daily-meta-item">' +
'<span>Revenue</span>' +
'<strong class="money">' + formatRupiah(day.daily_revenue || 0) + '</strong>' +
'</div>' +
'</div>' +
'</div>';
});

html += '</div>';
} else {
html += '<div class="stats-section-title"><i class="ri-calendar-line"></i> Daily Stats</div>' +
'<div class="stats-empty"><i class="ri-calendar-off-line"></i><p>No daily data</p><span>Waiting for transactions</span></div>';
}

statsBody.innerHTML = html;
}

function setupTheme() {
const savedTheme = localStorage.getItem(STORAGE.theme) || 'light';
if (savedTheme === 'dark') document.body.classList.add('dark-theme');
updateThemeButton();
}

function toggleTheme() {
const isDark = document.body.classList.toggle('dark-theme');
localStorage.setItem(STORAGE.theme, isDark ? 'dark' : 'light');
updateThemeButton();
}

function updateThemeButton() {
const btn = document.getElementById('darkModeBtn');
if (!btn) return;
const icon = btn.querySelector('i');
if (icon) icon.className = document.body.classList.contains('dark-theme') ? 'ri-sun-line' : 'ri-moon-line';
}

function setupSoundBtn() {
const btn = document.getElementById('soundBtn');
if (!btn) return;
const saved = localStorage.getItem(STORAGE.sound);
const isActive = saved !== 'false';
updateSoundIcon(isActive);
btn.addEventListener('click', function() {
const active = !btn.classList.contains('off');
localStorage.setItem(STORAGE.sound, active ? 'false' : 'true');
updateSoundIcon(!active);
showToast('Sound ' + (!active ? 'ON' : 'OFF'), !active ? 'success' : 'info');
});
}

function updateSoundIcon(active) {
const btn = document.getElementById('soundBtn');
if (!btn) return;
const icon = btn.querySelector('i');
if (active) {
btn.classList.remove('off');
if (icon) icon.className = 'ri-volume-up-line';
} else {
btn.classList.add('off');
if (icon) icon.className = 'ri-volume-mute-line';
}
}

function setupCompareTabs() {
const tabs = document.querySelectorAll('.compare-tab');
const saved = localStorage.getItem(STORAGE.compareRange);
if (saved) {
currentCompareRange = saved;
tabs.forEach(function(t) {
t.classList.toggle('active', t.dataset.range === saved);
});
}

tabs.forEach(function(tab) {
tab.addEventListener('click', function() {
tabs.forEach(function(t) { t.classList.remove('active'); });
tab.classList.add('active');
currentCompareRange = tab.dataset.range;
localStorage.setItem(STORAGE.compareRange, currentCompareRange);
updateCompare();
});
});
}

document.addEventListener('DOMContentLoaded', function() {
setupTheme();
setupSoundBtn();
setupCompareTabs();

fetchOrders();
startPolling();

const refreshBtn = document.getElementById('refreshBtn');
if (refreshBtn) {
refreshBtn.addEventListener('click', function() {
const btn = this;
btn.classList.add('spinning');
clearNewBadge();
fetchOrders().finally(function() {
setTimeout(function() { btn.classList.remove('spinning'); }, 500);
});
});
}

const darkModeBtn = document.getElementById('darkModeBtn');
if (darkModeBtn) darkModeBtn.addEventListener('click', toggleTheme);

const statsBtn = document.getElementById('statsBtn');
if (statsBtn) {
statsBtn.addEventListener('click', function() {
const statsModal = document.getElementById('statsModal');
if (statsModal) statsModal.classList.add('show');
loadStats();
});
}

const closeStatsBtn = document.getElementById('closeStatsBtn');
if (closeStatsBtn) {
const newBtn = closeStatsBtn.cloneNode(true);
closeStatsBtn.parentNode.replaceChild(newBtn, closeStatsBtn);
newBtn.addEventListener('click', function(e) {
e.stopPropagation();
e.preventDefault();
const statsModal = document.getElementById('statsModal');
if (statsModal) statsModal.classList.remove('show');
});
}

const statsModal = document.getElementById('statsModal');
if (statsModal) {
statsModal.addEventListener('click', function(e) {
if (e.target === this) this.classList.remove('show');
});
}

const searchInput = document.getElementById('searchInput');
const searchClear = document.getElementById('searchClear');

if (searchInput) {
searchInput.addEventListener('input', function() {
if (searchClear) searchClear.style.display = this.value.trim() ? 'flex' : 'none';
applyFilter();
});
}

if (searchClear) {
searchClear.addEventListener('click', function() {
searchInput.value = '';
searchClear.style.display = 'none';
applyFilter();
searchInput.focus();
});
}

document.querySelectorAll('.chip').forEach(function(chip) {
chip.addEventListener('click', function() {
document.querySelectorAll('.chip').forEach(function(c) { c.classList.remove('active'); });
chip.classList.add('active');
currentFilter = chip.dataset.filter;
applyFilter();
});
});

const sortSelect = document.getElementById('sortSelect');
if (sortSelect) sortSelect.addEventListener('change', applyFilter);

const dateFrom = document.getElementById('dateFrom');
const dateTo = document.getElementById('dateTo');
const dateClear = document.getElementById('dateClear');

if (dateFrom) {
dateFrom.addEventListener('change', function() {
if (dateClear) dateClear.style.display = (dateFrom.value || dateTo.value) ? 'flex' : 'none';
applyFilter();
});
}

if (dateTo) {
dateTo.addEventListener('change', function() {
if (dateClear) dateClear.style.display = (dateFrom.value || dateTo.value) ? 'flex' : 'none';
applyFilter();
});
}

if (dateClear) {
dateClear.addEventListener('click', function() {
dateFrom.value = '';
dateTo.value = '';
dateClear.style.display = 'none';
applyFilter();
});
}

const selectAllCheckbox = document.getElementById('selectAllCheckbox');
if (selectAllCheckbox) {
selectAllCheckbox.addEventListener('change', function() {
const isChecked = this.checked;
const currentPageOrders = filteredOrders.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
currentPageOrders.forEach(function(o) {
if (isChecked) selectedOrderIds.add(o.id);
else selectedOrderIds.delete(o.id);
});
renderList();
});
}

const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
if (bulkDeleteBtn) bulkDeleteBtn.addEventListener('click', bulkDelete);

const bulkCompleteBtn = document.getElementById('bulkCompleteBtn');
if (bulkCompleteBtn) bulkCompleteBtn.addEventListener('click', bulkComplete);

const bulkClearBtn = document.getElementById('bulkClearBtn');
if (bulkClearBtn) {
bulkClearBtn.addEventListener('click', function() {
selectedOrderIds.clear();
renderList();
});
}

const closeModalBtn = document.getElementById('closeModalBtn');
if (closeModalBtn) {
const newBtn = closeModalBtn.cloneNode(true);
closeModalBtn.parentNode.replaceChild(newBtn, closeModalBtn);
newBtn.addEventListener('click', function(e) {
e.stopPropagation();
e.preventDefault();
closeModal();
});
}

const detailModal = document.getElementById('detailModal');
if (detailModal) {
detailModal.addEventListener('click', function(e) {
if (e.target.id === 'detailModal') closeModal();
});
}

const prevBtn = document.getElementById('prevBtn');
if (prevBtn) {
prevBtn.addEventListener('click', function() {
if (currentPage > 1) {
currentPage--;
renderList();
window.scrollTo({ top: 0, behavior: 'smooth' });
}
});
}

const nextBtn = document.getElementById('nextBtn');
if (nextBtn) {
nextBtn.addEventListener('click', function() {
const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);
if (currentPage < totalPages) {
currentPage++;
renderList();
window.scrollTo({ top: 0, behavior: 'smooth' });
}
});
}

document.addEventListener('keydown', function(e) {
if (e.key === 'Escape') {
closeModal();
const statsModal = document.getElementById('statsModal');
if (statsModal && statsModal.classList.contains('show')) statsModal.classList.remove('show');
}
if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
e.preventDefault();
if (searchInput) searchInput.focus();
}
if (e.key === '/' && document.activeElement !== searchInput && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
e.preventDefault();
if (searchInput) searchInput.focus();
}
});

let deferredPrompt = null;
const installBanner = document.getElementById('installBanner');
const confirmInstall = document.getElementById('confirmInstall');
const dismissInstall = document.getElementById('dismissInstall');

window.addEventListener('beforeinstallprompt', function(e) {
e.preventDefault();
deferredPrompt = e;
if (localStorage.getItem('install_dismissed') === 'true') return;
if (installBanner) installBanner.classList.add('show');
});

if (confirmInstall) {
confirmInstall.addEventListener('click', async function() {
if (!deferredPrompt) {
if (installBanner) installBanner.classList.remove('show');
return;
}
deferredPrompt.prompt();
await deferredPrompt.userChoice;
deferredPrompt = null;
if (installBanner) installBanner.classList.remove('show');
});
}

if (dismissInstall) {
dismissInstall.addEventListener('click', function() {
if (installBanner) installBanner.classList.remove('show');
localStorage.setItem('install_dismissed', 'true');
});
}

window.addEventListener('appinstalled', function() {
if (installBanner) installBanner.classList.remove('show');
deferredPrompt = null;
localStorage.removeItem('install_dismissed');
});
});
