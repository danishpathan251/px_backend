const express = require("express");
const axios = require("axios");
const dotenv = require("dotenv");
const querystring = require('querystring');
const fs = require("fs");
const path = require("path");
dotenv.config();
const router = express.Router();

console.log("Redirect URI:", process.env.REDIRECT_URI);
console.log("API Key Present:", !!process.env.UPSTOX_API_KEY);
console.log("API Secret Present:", !!process.env.UPSTOX_API_SECRET);

// ------------------------------
// Home route
// ------------------------------
router.get('/', (req, res) => {
    res.send("Upstox Integration Server is Running!");
});

// ------------------------------
// STEP 1: LOGIN - Redirect to Upstox OAuth (FIXED)
// ------------------------------
const CLIENT_ID = "cb5ad589-49e0-44e3-abc4-c00eaea46132";
const REDIRECT_URI = "http://localhost:4000/api/auth/callback"; // Must match Upstox app settings
const BASE_URL = "https://api.upstox.com/v2";

// Step 1: Redirect user to Upstox login
router.get("/login", (req, res) => {
  const authUrl = `${BASE_URL}/login/authorization/dialog?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
  console.log("Generated Auth URL:", authUrl);
  res.redirect(authUrl);
});


// ------------------------------
// STEP 2: CALLBACK - Exchange code for token (FIXED)
// ------------------------------
router.get("/callback", async (req, res) => {
    try {
        const { code, error, error_description } = req.query;
        
        console.log("Callback received - Code:", code ? "Present" : "Missing");
        console.log("Error:", error);
        console.log("Error Description:", error_description);

        if (error) {
            return res.status(400).json({ 
                error: "Authorization failed", 
                details: error_description || error 
            });
        }
        
        if (!code) {
            return res.status(400).json({ 
                error: "No authorization code received" 
            });
        }

        // Prepare token request data
     const tokenData = querystring.stringify({
    code: code,
    client_id: process.env.UPSTOX_API_KEY,
    client_secret: process.env.UPSTOX_API_SECRET,
    redirect_uri: "http://localhost:4000/api/auth/callback", // <-- backend callback
    grant_type: 'authorization_code'
});

console.log("Exchanging code for token...");

const tokenResponse = await axios.post(
    'https://api.upstox.com/v2/login/authorization/token',
    tokenData,
    {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json'
        },
        timeout: 10000
    }
);

        const { access_token, refresh_token, token_type, expires_in } = tokenResponse.data;
        
        console.log("Token received successfully!");
        console.log("Token Type:", token_type);
        console.log("Expires in:", expires_in);

        // Store tokens securely (in session, database, or return to client)
        // For demo purposes, we'll return them (in production, store securely)
        // res.json({
        //     success: true,
        //     message: "Login successful!",
        //     access_token: access_token,
        //     refresh_token: refresh_token,
        //     token_type: token_type,
        //     expires_in: expires_in,
        //     // For testing holdings immediately
        //     holdings_url: `/holdings?token=${access_token}`
        // });
        res.redirect(`http://localhost:5173?token=${access_token}`);

    } catch (error) {
        console.error("Token exchange failed:");
        
        if (error.response) {
            // Upstox API error response
            console.error("Status:", error.response.status);
            console.error("Data:", error.response.data);
            console.error("Headers:", error.response.headers);
            
            res.status(error.response.status).json({
                error: "Token exchange failed",
                details: error.response.data
            });
        } else if (error.request) {
            // Network error
            console.error("No response received:", error.request);
            res.status(500).json({
                error: "Network error",
                details: "No response from Upstox API"
            });
        } else {
            // Other errors
            console.error("Error:", error.message);
            res.status(500).json({
                error: "Unexpected error",
                details: error.message
            });
        }
    }
});

// ------------------------------
// STEP 3: HOLDINGS API CALL (FIXED)
// ------------------------------
router.get("/holdings", async (req, res) => {
    const token = req.query.token || req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
        return res.status(400).json({ 
            error: "Missing access token",
            usage: "Add ?token=YOUR_ACCESS_TOKEN to URL or use Authorization header" 
        });
    }

    try {
        console.log("Fetching holdings with token...");
        
        const response = await axios.get(
            "https://api.upstox.com/v2/portfolio/long-term-holdings",
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: "application/json",
                },
                timeout: 10000
            }
        );

        const holdings = response.data.data || [];
        
        console.log(`Found ${holdings.length} holdings`);
        
        // Return JSON response
        res.json({
            success: true,
            count: holdings.length,
            holdings: holdings
        });
        // console.log(holdings);

    } catch (error) {
        console.error("Holdings API Error:");
        
        if (error.response) {
            console.error("Status:", error.response.status);
            console.error("Data:", error.response.data);
            
            res.status(error.response.status).json({
                error: "Failed to fetch holdings",
                details: error.response.data
            });
        } else {
            console.error("Error:", error.message);
            res.status(500).json({
                error: "Network error",
                details: error.message
            });
        }
    }
});

// ------------------------------
// Success and Error routes
// ------------------------------
router.get("/success", (req, res) => {
    res.send(`
        <h1>Login Successful!</h1>
        <p>Check your server console for the access token.</p>
        <a href="/login">Login Again</a>
    `);
});

router.get("/error", (req, res) => {
    res.send(`
        <h1>Login Failed</h1>
        <p>Check your server console for error details.</p>
        <a href="/login">Try Again</a>
    `);
});

// router.get("/search", async (req, res) => {
//   const query = req.query.query?.toLowerCase() || "";
//   const token = req.headers.authorization?.split(" ")[1];

//   if (!token) return res.status(401).json({ error: "No access token" });

//   try {
//     // Correct endpoint for fetching instruments
//     const instrumentsRes = await axios.get(
//       "https://api.upstox.com/instruments",
//       {
//         headers: {
//           Authorization: `Bearer ${token}`,
//         },
//       }
//     );

//     const instruments = instrumentsRes.data || [];

//     // Filter instruments based on query
//     const filtered = instruments
//       .filter(item =>
//         item.name.toLowerCase().includes(query) ||
//         item.symbol.toLowerCase().includes(query)
//       )
//       .slice(0, 10); // Limit to 10 results

//     res.json(filtered);

//   } catch (err) {
//     console.error("Stock fetch error:", err.response?.data || err.message);
//     res.status(500).json({ error: "Failed to fetch stocks" });
//   }
// });

router.get("/search", (req, res) => {
  const query = req.query.query?.toLowerCase() || "";

  try {
    // Load complete.json file
    const filePath = path.join(__dirname, "complete.json");
    const rawData = fs.readFileSync(filePath, "utf-8");
    const instruments = JSON.parse(rawData);
    // Filter: only equities + match query
    const filtered = instruments
      .filter(
        (item) =>
      
          (item.name && item.name.toLowerCase().includes(query) )
      )
      .slice(0, 10); // limit to 10
// console.log(filtered);

    res.json(filtered);
  } catch (err) {
    console.error("Stock fetch error:", err.message);
    res.status(500).json({ error: "Failed to fetch stocks from JSON" });
  }
});

const UPSTOX_API_BASE1 = 'https://api-sandbox.upstox.com/v3';
// Place an order
router.post('/order', async (req, res) => {
  const { accessToken, instrumentKey, transactionType, quantity, price, orderType } = req.body;

  if (!accessToken || !instrumentKey || !transactionType || !quantity || !orderType) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const payload ={
  "quantity": 1,
  "product": "CNC",
  "validity": "DAY",
  "price": 0,
  "instrument": "NSE_EQ|INE848E01016",
  "order_type": "MARKET",
  "transaction_type": "BUY",
  "disclosed_quantity": 0,
  "trigger_price": 0,
  "is_amo": false,
  "slice": true,
  "tag": "string"
};

    const response = await axios.post(`${UPSTOX_API_BASE1}/order/place`, payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    return res.json({ success: true, data: response.data });
  } catch (err) {
    console.error('Order API error:', err.response?.data || err.message);
    return res.status(500).json({ error: 'Failed to place order', details: err.response?.data || err.message });
  }
});


module.exports = router;