// --- CONFIG: replace these with values from Supabase Settings → API
const SUPABASE_URL = "https://vnokfvddilwmxzxqisig.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZub2tmdmRkaWx3bXh6eHFpc2lnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY3NDgwNjIsImV4cCI6MjA3MjMyNDA2Mn0.X7R4KEJyZ4ju9ZWOu8ITRRlT8W8jcudVHYbTdlIF2Uk";

// create client
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// UI refs
const loginScreen = document.getElementById("login-screen");
const dashboard = document.getElementById("dashboard");
const errorEl = document.getElementById("error");

// check if session exists on page load
window.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    loginScreen.style.display = "none";
    dashboard.style.display = "block";
    loadDashboard();
  }
});

// LOGIN
document.getElementById("login-btn").addEventListener("click", async () => {
  const btn = document.getElementById("login-btn");
  const err = document.getElementById("error");
  err.textContent = "";

  try {
    // Support either <input id="email"> or <input id="username">
    const emailInput = document.getElementById("email");
    const usernameInput = document.getElementById("username");

    let email, password;
    if (emailInput) {
      email = emailInput.value.trim();
    } else if (usernameInput) {
      const uname = usernameInput.value.trim();
      email = `${uname}@portal.local`; // <-- the fake email pattern you used
    } else {
      throw new Error("No email/username input found in HTML.");
    }
    password = document.getElementById("password")?.value || "";

    if (!email || !password) throw new Error("Please enter your credentials.");

    btn.disabled = true; btn.textContent = "Signing in…";

    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;

    // Show dashboard, then load it
    document.getElementById("login-screen").style.display = "none";
    document.getElementById("dashboard").style.display = "block";

    await loadDashboard().catch(e => {
      // If dashboard load fails, keep user signed in but show error
      console.error("loadDashboard error:", e);
      err.textContent = "Logged in, but failed to load data. Check console.";
    });
  } catch (e) {
    console.error("Login error:", e);
    err.textContent = e.message || "Login failed.";
  } finally {
    btn.disabled = false; btn.textContent = "Login";
  }
});


// LOGOUT
document.getElementById("logout-btn").addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  document.getElementById("dashboard").style.display = "none";
  document.getElementById("login-screen").style.display = "block";

  const adminSection = document.getElementById("admin-dashboard");
  const adminItems   = document.getElementById("admin-items");
  const allOrders    = document.getElementById("all-orders");
  if (adminSection) adminSection.style.display = "none";
  if (adminItems)   adminItems.innerHTML = "";
  if (allOrders)    allOrders.innerHTML = "";
});


// LOAD DASHBOARD
async function loadDashboard() {
  const adminSection = document.getElementById("admin-dashboard");
  if (adminSection) adminSection.style.display = "none"; // default: hidden

  const { data: { user }, error: userErr } = await supabaseClient.auth.getUser();
  if (userErr || !user) throw new Error("No authenticated user.");

  const { data: profile, error: profErr } = await supabaseClient
    .from("profiles")
    .select("group_name, username, is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (profErr) {
    console.warn("profiles fetch error:", profErr);
  }

  const displayName = profile?.group_name || profile?.username || "Unknown";
  document.getElementById("welcome").textContent = `Welcome, ${displayName}`;

  // --- HIDE ORDER HISTORY FOR ADMINS ---
  if (profile?.is_admin === true) {
    const historyBtn = document.getElementById("order-history-btn");
    const historyModal = document.getElementById("order-history");
    if (historyBtn) historyBtn.style.display = "none";
    if (historyModal) historyModal.style.display = "none";
  }

  // Admin section logic
  if (profile?.is_admin === true) {
    try { await loadAdminDashboard(); } 
    catch (e) { console.warn("Admin dashboard load failed:", e); }
  } else {
    if (adminSection) adminSection.style.display = "none";
  }

  // Load public items
  const { data: items, error: itemsErr } = await supabaseClient.from("items").select("*");
  if (itemsErr) throw itemsErr;

  const itemsGrid = document.getElementById("items-grid");
  itemsGrid.innerHTML = "";
  items.forEach(i => {
    const card = document.createElement("div");
    card.className = "item-card";
    card.innerHTML = `
      <img src="${i.image_url}" alt="${i.name}">
      <h3>${i.name}</h3>
      <p><strong>Price:</strong> ${i.price}</p>
      <p><strong>Weekly Limit:</strong> ${i.stock_limit}</p>
    `;
    itemsGrid.appendChild(card);
  });
}


// ADMIN DASHBOARD (admin-only, with re-check + group order history popup)
async function loadAdminDashboard() {
  const adminDashboard      = document.getElementById("admin-dashboard");
  const adminItemsContainer = document.getElementById("admin-items");
  const allOrdersDiv        = document.getElementById("all-orders");
  if (!adminDashboard || !adminItemsContainer || !allOrdersDiv) {
    console.warn("Admin panel containers missing.");
    return;
  }

  try {
    // Re-check the current user is actually an admin
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;

    const { data: me, error: meErr } = await supabaseClient
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .maybeSingle();

    if (meErr) {
      console.warn("Admin self-check failed:", meErr);
      return;
    }
    if (me?.is_admin !== true) {
      return;
    }

    // Fetch all profiles
    const { data: profiles, error: profilesError } = await supabaseClient
      .from("profiles")
      .select("id, username, group_name, image_url, is_admin")
      .order("group_name", { ascending: true });

    if (profilesError) {
      console.error("Error fetching profiles:", profilesError);
      return;
    }

    // Filter out admins and the current admin user
    const nonAdmins = (profiles || []).filter(p => p.is_admin !== true && p.id !== user.id);

    adminItemsContainer.innerHTML = "";

    nonAdmins.forEach(profile => {
      const name = profile.group_name || profile.username || "Unknown";
      const img  = profile.image_url || "img/default.png";

      const card = document.createElement("div");
      card.className = "admin-item-card";
      card.innerHTML = `<img src="${img}" alt="${name}"><p>${name}</p>`;

      // Add click listener to show group's order history
      card.addEventListener("click", async () => {
        const groupHistoryModal = document.getElementById("group-history-modal");
        const groupOrdersList   = document.getElementById("group-orders-list");
        const groupTitle        = document.getElementById("group-history-title");

        if (!groupHistoryModal || !groupOrdersList || !groupTitle) return;

        groupOrdersList.innerHTML = "<p>Loading...</p>";
        groupTitle.textContent = `Order History: ${name}`;
        groupHistoryModal.style.display = "block";

        const { data: orders, error } = await supabaseClient
          .from("orders")
          .select("date, items, total_price")
          .eq("user_id", profile.id)
          .order("date", { ascending: false });

        groupOrdersList.innerHTML = "";

        if (error || !orders || orders.length === 0) {
          groupOrdersList.innerHTML = "<p>No orders found for this group.</p>";
          return;
        }

        orders.forEach(order => {
          const div = document.createElement("div");
          div.className = "order-entry";
          div.innerHTML = `
            <p><strong>Date:</strong> ${new Date(order.date).toLocaleDateString()}</p>
            <p><strong>Items:</strong> ${order.items}</p>
            <p><strong>Total:</strong> ${order.total_price}</p>
            <hr>
          `;
          groupOrdersList.appendChild(div);
        });
      });

      adminItemsContainer.appendChild(card);
    });

    // ✅ NEW: Fetch and display from current_orders table
    const { data: currentOrderData, error: currentOrdersErr } = await supabaseClient
      .from("current_orders")
      .select("order_text")
      .single(); // we expect only one row

    if (currentOrdersErr || !currentOrderData) {
      allOrdersDiv.innerHTML = "<p>Unable to load current orders.</p>";
      console.warn("Unable to load current_orders table:", currentOrdersErr);
    } else {
      allOrdersDiv.innerHTML = `<pre>${currentOrderData.order_text}</pre>`;
    }

    // Show admin panel after successful rendering
    adminDashboard.style.display = "block";
    
  } catch (e) {
    console.error("loadAdminDashboard failed:", e);
  }
}




// --- ORDER HISTORY FUNCTIONALITY (unchanged from before) ---
const orderHistoryBtn = document.getElementById("order-history-btn");
const orderHistoryModal = document.getElementById("order-history");
const closeHistory = document.getElementById("close-history");
const ordersList = document.getElementById("orders-list");

// 🟢 Show Order History Modal
if (orderHistoryBtn) {
  orderHistoryBtn.addEventListener("click", async () => {
    ordersList.innerHTML = "<p>Loading...</p>";

    const { data: { user }, error: userErr } = await supabaseClient.auth.getUser();
    if (userErr || !user) {
      ordersList.innerHTML = "<p>Error: User not logged in.</p>";
      return;
    }

    // 🔄 Fetch that user's order history
    const { data: orders, error } = await supabaseClient
      .from("orders")
      .select("date, items, total_price")
      .eq("user_id", user.id)
      .order("date", { ascending: false });

    ordersList.innerHTML = "";

    if (error) {
      console.error("Error fetching orders:", error);
      ordersList.innerHTML = "<p>Failed to load order history.</p>";
      return;
    }

    if (!orders || orders.length === 0) {
      ordersList.innerHTML = "<p>No orders found.</p>";
      return;
    }

    if (closeHistory) {
  closeHistory.addEventListener("click", () => {
    orderHistoryModal.style.display = "none";
  });

  window.addEventListener("click", (event) => {
    if (event.target === orderHistoryModal) {
      orderHistoryModal.style.display = "none";
    }
  });
}


    // 🟢 Render the fetched orders
    orders.forEach(order => {
      const div = document.createElement("div");
      div.className = "order-entry";
      div.innerHTML = `
        <p><strong>Date:</strong> ${new Date(order.date).toLocaleDateString()}</p>
        <p><strong>Items:</strong> ${order.items}</p>
        <p><strong>Total:</strong> ${order.total_price}</p>
        <hr>
      `;
      ordersList.appendChild(div);
    });

    orderHistoryModal.style.display = "block";
  });
}

// --- ADMIN GROUP ORDER HISTORY MODAL ---
const groupHistoryModal = document.getElementById("group-history-modal");
const closeGroupHistory = document.getElementById("close-group-history");
const groupOrdersList = document.getElementById("group-orders-list");
const groupHistoryTitle = document.getElementById("group-history-title");

if (closeGroupHistory) {
  closeGroupHistory.addEventListener("click", () => {
    groupHistoryModal.style.display = "none";
  });

  window.addEventListener("click", (e) => {
    if (e.target === groupHistoryModal) {
      groupHistoryModal.style.display = "none";
    }
  });
}


