// Test the API directly
require("dotenv").config({ path: ".env.local" });

async function testAPI() {
  console.log("🧪 Testing Update All API directly...");
  
  try {
    const response = await fetch("http://localhost:3001/api/storefronts/update-all", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      }
    });

    console.log("📡 Response status:", response.status);
    
    const data = await response.json();
    console.log("📊 Response data:", data);

    if (!response.ok) {
      console.log("❌ API returned error:", data);
    } else {
      console.log("✅ API call successful:", data);
    }

  } catch (error) {
    console.error("❌ Error calling API:", error.message);
  }
}

testAPI();