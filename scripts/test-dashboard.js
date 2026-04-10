#!/usr/bin/env node

import { loadConfig } from '../src/config.js';
import { getBridgeBaseUrl } from '../src/bootstrap.js';

// Test script per verificare la dashboard
const baseUrl = getBridgeBaseUrl(loadConfig());

async function testDashboard() {
    console.log('🧪 Testing Dashboard APIs...\n');

    try {
        // Test 1: Dashboard HTML
        console.log('1. Testing /dashboard endpoint...');
        const dashboardResponse = await fetch(`${baseUrl}/dashboard`);
        const dashboardHtml = await dashboardResponse.text();

        if (dashboardResponse.ok && dashboardHtml.includes('Claude Ollama Bridge')) {
            console.log('✅ Dashboard HTML loaded successfully');
        } else {
            console.log('❌ Failed to load dashboard HTML');
        }

        // Test 2: Usage API
        console.log('\n2. Testing /api/usage endpoint...');
        const usageResponse = await fetch(`${baseUrl}/api/usage`);
        const usageData = await usageResponse.json();

        if (usageResponse.ok && usageData.summary) {
            console.log('✅ Usage API working correctly');
            console.log(`   - Total keys: ${usageData.summary.totalKeys}`);
            console.log(`   - Healthy keys: ${usageData.summary.healthyKeys}`);
            console.log(`   - Rate limited keys: ${usageData.summary.rateLimitedKeys}`);
            console.log(`   - Session usage: ${usageData.summary.session.percentage.toFixed(1)}%`);
            console.log(`   - Weekly usage: ${usageData.summary.weekly.percentage.toFixed(1)}%`);
        } else {
            console.log('❌ Failed to fetch usage data');
        }

        // Test 3: Individual key status
        console.log('\n3. Testing individual key status...');
        const keys = usageData.keys || [];
        keys.forEach((key, index) => {
            const keyId = key.key.substring(0, 20) + '...';
            const sessionUsage = key.usage?.session?.percentage || 0;
            const isRateLimited = key.isRateLimited || false;
            const status = isRateLimited ? '🔴 RATE LIMITED' : '🟢 HEALTHY';

            console.log(`   Key ${index + 1}: ${status} (${sessionUsage.toFixed(1)}% session usage)`);
        });

        // Test 4: Rate limit detection
        console.log('\n4. Testing rate limit detection...');
        const rateLimitedKeys = keys.filter(k => k.isRateLimited);
        if (rateLimitedKeys.length > 0) {
            console.log(`✅ Detected ${rateLimitedKeys.length} rate limited keys:`);
            rateLimitedKeys.forEach(key => {
                const resetIn = Math.ceil((key.rateLimitResetTime - Date.now()) / 60000);
                console.log(`   - Resets in ${resetIn} minutes`);
            });
        } else {
            console.log('✅ No rate limited keys detected');
        }

        console.log('\n🎉 Dashboard test completed successfully!');
        console.log('\n💡 Next steps:');
        console.log(`   - Open ${baseUrl}/dashboard in your browser`);
        console.log('   - Monitor usage in real-time');
        console.log('   - Check rate limited keys');

    } catch (error) {
        console.error('❌ Error testing dashboard:', error.message);
        process.exit(1);
    }
}

// Run the test
testDashboard();
