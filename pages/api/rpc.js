// Multi-node RPC proxy with failover, queuing, and DETAILED ANALYTICS
// Tracks every request to diagnose rate limiting issues

// 🔐 PRIVATE RPC for all READ operations (eth_call, eth_getBalance, etc.)
// 🌐 PUBLIC nodes ONLY for WRITE operations (eth_sendTransaction, eth_estimateGas)
const PRIVATE_RPC = process.env.PRIVATE_RPC_URL || 'https://rpc.cetra.app'; // Your private RPC
const PUBLIC_NODES = [
    'https://evm.rpc-testnet-donut-node1.push.org',
    'https://evm.rpc-testnet-donut-node2.push.org',
];

// Combine all nodes for health tracking
// Private first, then public
const RPC_NODES = [PRIVATE_RPC, ...PUBLIC_NODES];

// Methods that require wallet interaction OR transaction tracking (use public nodes)
// CRITICAL: Transaction receipts MUST use same nodes as sendTransaction for consistency
const WALLET_METHODS = [
    'eth_sendTransaction',
    'eth_sendRawTransaction',
    'eth_sign',
    'eth_signTransaction',
    'personal_sign',
    'eth_signTypedData',
    'eth_signTypedData_v4',
    'wallet_switchEthereumChain',
    'wallet_addEthereumChain',
    'eth_getTransactionReceipt',  // ✅ Must use same node as transaction
    'eth_getTransactionByHash',   // ✅ Must use same node as transaction
    'eth_estimateGas',            // ✅ Wallet interaction
    'eth_gasPrice',               // ✅ Wallet interaction
];

// Determine which RPC to use based on method
function getRPCNodes(method) {
    if (WALLET_METHODS.includes(method)) {
        // Wallet methods: Only generic public nodes (to avoid private key leak risk? No, private RPC is fine usually, but let's stick to public for consistency)
        // Actually, for better reliability, we could include Private RPC last?
        // But original code split them. Let's keep it split but add fallback for reads.
        return PUBLIC_NODES;
    }
    // Read methods: Try Private first, then fall back to Public
    return [PRIVATE_RPC, ...PUBLIC_NODES];
}

// Request queue
const requestQueue = [];
let isProcessing = false;
const QUEUE_DELAY = 50;

// Track node health
const nodeHealth = RPC_NODES.map(() => ({
    failures: 0,
    lastFailure: 0,
    backoffUntil: 0
}));

// 📊 ANALYTICS - Track everything
const analytics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    queuedRequests: 0,
    methodCounts: {},
    nodeStats: RPC_NODES.map((url) => ({
        url,
        requests: 0,
        successes: 0,
        failures: 0,
        rateLimits: 0,
        serverErrors: 0,
        timeouts: 0
    })),
    startTime: Date.now()
};

// Log analytics every 10 seconds
setInterval(() => {
    const uptime = Math.floor((Date.now() - analytics.startTime) / 1000);
    const reqPerMin = Math.floor((analytics.totalRequests / uptime) * 60);

    console.log('\n📊 === RPC PROXY ANALYTICS ===');
    console.log(`⏱️  Uptime: ${uptime}s | Total Requests: ${analytics.totalRequests} (${reqPerMin}/min)`);
    console.log(`✅ Success: ${analytics.successfulRequests} | ❌ Failed: ${analytics.failedRequests} | 📦 Queued: ${requestQueue.length}`);

    console.log('\n🎯 Top Methods:');
    const topMethods = Object.entries(analytics.methodCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
    topMethods.forEach(([method, count]) => {
        console.log(`  ${method}: ${count} requests`);
    });

    console.log('\n🌐 Node Health:');
    analytics.nodeStats.forEach((node, idx) => {
        const successRate = node.requests > 0 ? Math.floor((node.successes / node.requests) * 100) : 0;
        const health = nodeHealth[idx];
        const backoff = health.backoffUntil > Date.now() ? `BACKOFF ${Math.ceil((health.backoffUntil - Date.now()) / 1000)}s` : 'HEALTHY';
        console.log(`  Node${idx + 1}: ${node.requests} req | ${successRate}% success | ${node.rateLimits} 429s | ${node.serverErrors} 5xx | ${node.timeouts} timeouts | ${backoff}`);
    });
    console.log('=========================\n');
}, 10000);

// Process queue sequentially
async function processQueue() {
    if (isProcessing || requestQueue.length === 0) return;

    isProcessing = true;
    while (requestQueue.length > 0) {
        const { resolve, reject, body } = requestQueue.shift();
        try {
            const result = await makeRpcRequest(body);
            resolve(result);
        } catch (error) {
            reject(error);
        }
        // No delay - caching prevents bursts
    }
    isProcessing = false;
}

// Make actual RPC request with node failover
async function makeRpcRequest(body) {
    const now = Date.now();
    const method = body?.method || 'unknown';

    // Track method
    analytics.methodCounts[method] = (analytics.methodCounts[method] || 0) + 1;

    // 🎯 SMART ROUTING - Use private RPC for reads, public nodes for writes
    const nodesToUse = getRPCNodes(method);

    // Find healthy nodes
    // CRITICAL FIX: Map based on GLOBAL index in RPC_NODES, not local index in nodesToUse
    const healthyNodes = nodesToUse.map(url => {
        const globalIndex = RPC_NODES.indexOf(url);
        return {
            url,
            index: globalIndex,
            health: nodeHealth[globalIndex]
        };
    }).filter(node => now >= node.health.backoffUntil)
        .sort((a, b) => a.health.failures - b.health.failures);

    if (healthyNodes.length === 0) {
        // If all healthy nodes for this method are down, pick the one with oldest failure (from available nodes)
        // We must check only nodes relevant to this method
        // But for simplicity, we fallback to the first relevant node
        const fallbackUrl = nodesToUse[0];
        const fallbackIndex = RPC_NODES.indexOf(fallbackUrl);

        nodeHealth[fallbackIndex].backoffUntil = 0;
        nodeHealth[fallbackIndex].failures = 0;
        healthyNodes.push({ url: fallbackUrl, index: fallbackIndex, health: nodeHealth[fallbackIndex] });
    }

    let lastError;

    for (const { url, index, health } of healthyNodes) {
        const nodeStats = analytics.nodeStats[index];
        nodeStats.requests++;

        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 8000);

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: controller.signal
            });

            clearTimeout(timeout);

            // Handle rate limiting
            if (response.status === 429) {
                nodeStats.rateLimits++;
                nodeStats.failures++;
                health.failures++;
                health.lastFailure = now;
                health.backoffUntil = now + (Math.pow(2, Math.min(health.failures, 6)) * 1000);
                console.warn(`⚠️  Node [${url}] RATE LIMITED (429) - ${method}`);
                lastError = new Error(`Node ${url} rate limited`);
                continue;
            }

            // Handle server errors
            if (response.status >= 500) {
                nodeStats.serverErrors++;
                nodeStats.failures++;
                health.failures++;
                health.lastFailure = now;
                health.backoffUntil = now + 2000;
                console.warn(`⚠️  Node [${url}] SERVER ERROR (${response.status}) - ${method}`);
                lastError = new Error(`Node ${url} server error: ${response.status}`);
                continue;
            }

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            // Success!
            nodeStats.successes++;
            health.failures = Math.max(0, health.failures - 1);

            return data;

        } catch (error) {
            if (error.name === 'AbortError') {
                nodeStats.timeouts++;
                nodeStats.failures++;
                health.failures++;
                health.lastFailure = now;
                health.backoffUntil = now + 3000;
                // console.warn(`⚠️  Node [${url}] TIMEOUT - ${method}`);
            }
            lastError = error;
            continue;
        }
    }

    // All nodes failed
    throw lastError || new Error('All RPC nodes unavailable');
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    analytics.totalRequests++;
    analytics.queuedRequests++;

    try {
        const result = await new Promise((resolve, reject) => {
            requestQueue.push({ resolve, reject, body: req.body });
            processQueue();
        });

        analytics.successfulRequests++;
        analytics.queuedRequests--;
        return res.status(200).json(result);
    } catch (error) {
        analytics.failedRequests++;
        analytics.queuedRequests--;
        // Only log if NOT an AbortError/Timeout
        if (error.name !== 'AbortError' && !error.message.includes('aborted')) {
            console.error('❌ RPC Proxy Error:', error.message, '- Method:', req.body?.method);
        }
        return res.status(502).json({
            jsonrpc: '2.0',
            id: req.body?.id || null,
            error: {
                code: -32603,
                message: 'All RPC nodes temporarily unavailable. Please retry.'
            }
        });
    }
}
