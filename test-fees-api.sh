#!/bin/bash

echo "Testing fees API for ASIN B006ZIYYYE"
echo "Selling Price: £26.00"
echo "Cost Price: £12.43"
echo "===================="

# Call the comprehensive fees API
curl -X POST http://localhost:3000/api/fees/comprehensive \
  -H "Content-Type: application/json" \
  -d '{
    "asin": "B006ZIYYYE",
    "sellPrice": 26.00,
    "costPrice": 12.43
  }' | jq '.'