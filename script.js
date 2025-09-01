// --- CONFIG: replace with your Supabase values
const SUPABASE_URL = "https://vnokfvddilwmxzxqisig.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZub2tmdmRkaWx3bXh6eHFpc2lnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY3NDgwNjIsImV4cCI6MjA3MjMyNDA2Mn0.X7R4KEJyZ4ju9ZWOu8ITRRlT8W8jcudVHYbTdlIF2Uk";

// Supabase client
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// UI references
const loginScreen = document.getElementById("login-screen");
const dashboard = document.getElementById("dashboard");
const errorEl = document.getElementById("error");

// Check existing session on load
window.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    loginScreen.style.display = "none";
    dashboard.style.display = "block";
    await loadDashboard();
  }
});

// LOGIN
document.getElementById("login-btn").addEventListener("click", async () => {
  errorEl.textContent = "";
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;
  if (!username || !password) { errorEl.textContent = "Username + password required"; return; }

  // Convert username → fake email for Supabase
  const email = `${username.toLowerCase()}@portal.local`;

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) { errorEl.textContent = "Invalid username or password"; return; }

  loginScreen.style.display = "none";
  dashboard.style.display = "block";
  await loadDashboard();
});

// LOGOUT
document.getElementById("logout-btn").addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  dashboard.style.display = "none";
  loginScreen.style.display = "block";
});

// LOAD DASHBOARD
async function loadDashboard() {
  const { data: { user } } = await supabaseClient.auth.getUser();

  // Get profile
  const { data: profile } = await supabaseClient
    .from('profiles')
    .select('group_name, username')
    .eq('id', user.id)
    .single();

  const displayName = profile?.group_name || profile?.username || "Unknown";
  document.getElementById("welcome").textContent = `Welcome, ${displayName}`;

  // Fetch items
  const { data: items, error } = await supabaseClient.from('items').select('*');
  if (error) { console.error(error); return; }

console.log("Items fetched from Supabase:", items.map(i => i.name));

  const itemsGrid = document.getElementById("items-grid");
  itemsGrid.innerHTML = ""; // <-- clears any existing cards

  // Create cards
  items.forEach(item => {
    const card = document.createElement("div");
    card.className = "item-card";
    card.innerHTML = `
      <img src="${item.image_url}" alt="${item.name}">
      <h3>${item.name}</h3>
      <p><strong>Price:</strong> ${item.price}</p>
      <p><strong>Weekly Limit:</strong> ${item.stock_limit}</p>
    `;
    itemsGrid.appendChild(card);
  });
}
