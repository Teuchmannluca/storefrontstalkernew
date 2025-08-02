#!/bin/bash

echo "=== Testing Live SP-API for ASIN B0027BC1NO ==="
echo "Cost: £94.59, Sale Price: £150.00"
echo ""

# Check if dev server is running
if pgrep -f "next dev" > /dev/null; then
    echo "✅ Development server is running"
    
    # Test the comprehensive API
    echo "Calling live API..."
    curl -s -X POST http://localhost:3000/api/fees/comprehensive \
        -H "Content-Type: application/json" \
        -d '{
            "asin": "B0027BC1NO",
            "sellPrice": 150.00,
            "costPrice": 94.59,
            "fulfillmentMethod": "FBA",
            "isVatRegistered": true,
            "pricesIncludeVat": true
        }' | jq .
        
else
    echo "❌ Development server not running"
    echo "Starting development server..."
    npm run dev &
    sleep 10
    
    echo "Testing API..."
    curl -s -X POST http://localhost:3000/api/fees/comprehensive \
        -H "Content-Type: application/json" \
        -d '{
            "asin": "B0027BC1NO",
            "sellPrice": 150.00,
            "costPrice": 94.59,
            "fulfillmentMethod": "FBA",
            "isVatRegistered": true,
            "pricesIncludeVat": true
        }' | jq .
fi