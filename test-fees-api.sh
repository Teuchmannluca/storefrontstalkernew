#!/bin/bash

echo "Testing fees API for ASIN B072VL8MNQ"
echo "Selling Price: £33.00"
echo "Cost Price: £18.48"
echo "===================="

# Call the comprehensive fees API
curl -X POST http://localhost:3000/api/fees/comprehensive \
  -H "Content-Type: application/json" \
  -d '{
    "asin": "B072VL8MNQ",
    "sellPrice": 33.00,
    "costPrice": 18.48
  }' | jq '.'