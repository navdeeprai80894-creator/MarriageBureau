"use strict";

/* =========================================================
   MATRIMONYHUB
   Marriage Bureau Management System

   Internship Task: WD-MAT-004
   Company: Data Alcott Systems

   Frontend-only demonstration application.

   IMPORTANT:
   Authentication is simulated.
   Do not store real passwords or sensitive client data.
========================================================= */


/* =========================================================
   1. APPLICATION CONFIGURATION
========================================================= */

const CONFIG = {
    storageKey: "matrimonyhub_data_v1",
    sessionKey: "matrimonyhub_session_v1",
    themeKey: "matrimonyhub_theme_v1",
    maxImageSize: 1024 * 1024,
    defaultAvatar: "assets/images/default-avatar.svg"
};


/* =========================================================
   2. APPLICATION STATE
========================================================= */

let db = {
    users: [],
    clients: [],
    matches: [],
    inquiries: [],
    messages: [],
    stories: [],
    notifications: [],
    activities: []
};

let currentUser = null;
let currentStep = 1;
let editingClientId = null;
let selectedClientId = null;
let selectedChatClientId = null;
let selectedMatchClientId = null;
let pendingConfirmation = null;
let clientPhotoData = "";
let storyPhotoData = "";
let lastFocusedElement = null;


/* =========================================================
   3. UTILITY FUNCTIONS
========================================================= */

function $(selector) {
    return document.querySelector(selector);
}

function $$(selector) {
    return Array.from(document.querySelectorAll(selector));
}

function byId(id) {
    return document.getElementById(id);
}

function escapeHTML(value) {
    return String(value ?? "").replace(
        /[&<>"']/g,
        character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[character]
    );
}

function createId() {
    if (window.crypto && crypto.randomUUID) {
        return crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function nowISO() {
    return new Date().toISOString();
}

function formatDate(value) {
    if (!value) return "Not specified";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "Invalid date";
    }

    return date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });
}

function formatDateTime(value) {
    if (!value) return "";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "";

    return date.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function calculateAge(dob) {
    if (!dob) return 0;

    const birth = new Date(`${dob}T00:00:00`);
    const today = new Date();

    if (Number.isNaN(birth.getTime())) return 0;

    let age = today.getFullYear() - birth.getFullYear();

    const monthDifference = today.getMonth() - birth.getMonth();

    if (
        monthDifference < 0 ||
        (
            monthDifference === 0 &&
            today.getDate() < birth.getDate()
        )
    ) {
        age--;
    }

    return age;
}

function formatMoney(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) return "Not specified";

    return `₹${number.toLocaleString("en-IN")}`;
}

function normalize(value) {
    return String(value ?? "").trim().toLowerCase();
}

function safeImage(source) {
    const value = String(source || "");

    if (
        value.startsWith("data:image/png;base64,") ||
        value.startsWith("data:image/jpeg;base64,") ||
        value.startsWith("data:image/webp;base64,")
    ) {
        return escapeHTML(value);
    }

    return CONFIG.defaultAvatar;
}

function getClient(id) {
    return db.clients.find(
        client => String(client.id) === String(id)
    );
}

function getClientName(id) {
    const client = getClient(id);

    return client ? client.name : "Deleted Client";
}

function isStaff() {
    return currentUser?.role === "staff";
}

function canManageClient(client) {
    return isStaff() ||
        (
            currentUser?.role === "client" &&
            client?.ownerId === currentUser.id
        );
}

function visibleClients() {
    if (!currentUser) return [];

    if (isStaff()) {
        return db.clients;
    }

    return db.clients.filter(
        client => client.status !== "Pending"
    );
}

function ownedClients() {
    if (!currentUser) return [];

    if (isStaff()) return db.clients;

    return db.clients.filter(
        client => client.ownerId === currentUser.id
    );
}

function requireStaff() {
    if (!isStaff()) {
        showToast(
            "This action is available to bureau staff only.",
            "error"
        );

        return false;
    }

    return true;
}

function emptyMessage(message) {
    return `
        <div class="empty-state">
            <div class="empty-icon">
                <i class="fas fa-folder-open"></i>
            </div>
            <h3>No Records Available</h3>
            <p>${escapeHTML(message)}</p>
        </div>
    `;
}


/* =========================================================
   4. LOCAL STORAGE
========================================================= */

function saveData() {
    try {
        localStorage.setItem(
            CONFIG.storageKey,
            JSON.stringify(db)
        );

        return true;

    } catch (error) {
        console.error("Storage error:", error);

        showToast(
            "Unable to save data. Browser storage may be full.",
            "error"
        );

        return false;
    }
}

function loadData() {
    try {
        const saved = localStorage.getItem(CONFIG.storageKey);

        if (!saved) {
            createSampleData();
            saveData();
            return;
        }

        const parsed = JSON.parse(saved);

        if (!parsed || typeof parsed !== "object") {
            throw new Error("Invalid storage format");
        }

        for (const key of Object.keys(db)) {
            db[key] = Array.isArray(parsed[key])
                ? parsed[key]
                : [];
        }

    } catch (error) {
        console.error("Unable to load saved data:", error);

        createSampleData();

        showToast(
            "Stored data could not be loaded. Demo data restored.",
            "warning"
        );
    }
}

function saveSession() {
    try {
        if (currentUser) {
            sessionStorage.setItem(
                CONFIG.sessionKey,
                String(currentUser.id)
            );
        } else {
            sessionStorage.removeItem(CONFIG.sessionKey);
        }
    } catch (error) {
        console.error("Session storage unavailable:", error);
    }
}

function restoreSession() {
    try {
        const id = sessionStorage.getItem(CONFIG.sessionKey);

        currentUser = db.users.find(
            user => String(user.id) === id
        ) || null;

    } catch (error) {
        currentUser = null;
    }
}


/* =========================================================
   5. SAMPLE DATA
========================================================= */

function sampleClient({
    id,
    name,
    gender,
    dob,
    religion,
    caste,
    education,
    occupation,
    location,
    income,
    status = "Active",
    preferredGender = "Any"
}) {
    return {
        id,
        ownerId: null,
        name,
        gender,
        dob,
        maritalStatus: "Never Married",
        religion,
        caste,
        motherTongue: "Tamil",
        status,

        familyType: "Nuclear",
        familyValues: "Moderate",
        fatherOccupation: "Business",
        motherOccupation: "Homemaker",
        siblings: 1,

        education,
        occupation,
        income,
        location,

        preferences: {
            minAge: 23,
            maxAge: 36,
            gender: preferredGender,
            religion: "Any",
            caste: "",
            education: "Any",
            occupation: "",
            location: ""
        },

      photo: gender === "Female"
    ? `https://randomuser.me/api/portraits/women/${(Number(String(id).replace(/\D/g, "")) % 90) + 1}.jpg`
    : `https://randomuser.me/api/portraits/men/${(Number(String(id).replace(/\D/g, "")) % 90) + 1}.jpg`,

gallery: [],
createdAt: nowISO()
    };
}

function createSampleData() {
    db = {
        users: [
            {
                id: "admin-001",
                name: "Bureau Admin",
                email: "admin@matrimonyhub.com",
                password: "Admin@123",
                role: "staff"
            }
        ],

        clients: [
            sampleClient({
                id: "C001",
                name: "Priya Sharma",
                gender: "Female",
                dob: "1999-08-15",
                religion: "Hindu",
                caste: "Brahmin",
                education: "MBA",
                occupation: "Marketing Manager",
                location: "Chennai",
                income: 900000,
                preferredGender: "Male"
            }),

            sampleClient({
                id: "C002",
                name: "Rahul Verma",
                gender: "Male",
                dob: "1997-04-12",
                religion: "Hindu",
                caste: "Brahmin",
                education: "B.Tech",
                occupation: "Software Engineer",
                location: "Chennai",
                income: 1200000,
                preferredGender: "Female"
            }),

            sampleClient({
                id: "C003",
                name: "Ananya Iyer",
                gender: "Female",
                dob: "1998-11-20",
                religion: "Hindu",
                caste: "Iyer",
                education: "M.Tech",
                occupation: "Data Analyst",
                location: "Bangalore",
                income: 1100000,
                preferredGender: "Male"
            }),

            sampleClient({
                id: "C004",
                name: "Arjun Kumar",
                gender: "Male",
                dob: "1996-06-05",
                religion: "Hindu",
                caste: "Any",
                education: "MBA",
                occupation: "Business Analyst",
                location: "Bangalore",
                income: 1500000,
                preferredGender: "Female"
            }),

            sampleClient({
                id: "C005",
                name: "Sara Thomas",
                gender: "Female",
                dob: "2000-02-18",
                religion: "Christian",
                caste: "",
                education: "B.Sc",
                occupation: "Nurse",
                location: "Coimbatore",
                income: 600000,
                preferredGender: "Male"
            }),

            sampleClient({
                id: "C006",
                name: "David Joseph",
                gender: "Male",
                dob: "1997-09-09",
                religion: "Christian",
                caste: "",
                education: "B.E",
                occupation: "Mechanical Engineer",
                location: "Coimbatore",
                income: 850000,
                preferredGender: "Female"
            }),

            sampleClient({
                id: "C007",
                name: "Meera Nair",
                gender: "Female",
                dob: "1999-03-25",
                religion: "Hindu",
                caste: "Nair",
                education: "MBA",
                occupation: "HR Executive",
                location: "Chennai",
                income: 750000,
                preferredGender: "Male"
            }),

            sampleClient({
                id: "C008",
                name: "Vikram Reddy",
                gender: "Male",
                dob: "1995-12-10",
                religion: "Hindu",
                caste: "Reddy",
                education: "M.Tech",
                occupation: "Project Manager",
                location: "Hyderabad",
                income: 1800000,
                preferredGender: "Female"
            })
        ],

        matches: [
            {
                id: createId(),
                clientId: "C001",
                matchedClientId: "C002",
                score: 85,
                status: "Active",
                date: nowISO()
            }
        ],

        inquiries: [
            {
                id: createId(),
                clientId: "C001",
                subject: "Profile Information",
                message: "I would like to know more about the matchmaking process.",
                status: "Pending",
                timestamp: nowISO()
            },

            {
                id: createId(),
                clientId: "C003",
                subject: "Matchmaking Assistance",
                message: "Please help me find suitable matches.",
                status: "Resolved",
                timestamp: nowISO()
            }
        ],

        messages: [
            {
                id: createId(),
                clientId: "C001",
                sender: "staff",
                text: "Welcome to MatrimonyHub! How can we assist you?",
                timestamp: nowISO()
            }
        ],

        stories: [
            {
                id: createId(),
                coupleName: "Aarav & Kavya",
                date: "2025-12-15",
                story: "A beautiful journey that began through MatrimonyHub. Their shared values and understanding helped them build a wonderful relationship.",
                image: ""
            },

            {
                id: createId(),
                coupleName: "Rohan & Sneha",
                date: "2025-08-20",
                story: "Their families connected through our bureau. After several meaningful conversations, they decided to begin a new chapter together.",
                image: ""
            }
        ],

        notifications: [
            {
                id: createId(),
                title: "Welcome to MatrimonyHub",
                message: "Your marriage bureau dashboard is ready.",
                read: false,
                timestamp: nowISO()
            }
        ],

        activities: [
            {
                id: createId(),
                title: "Demo Data Initialized",
                description: "Sample matrimonial profiles are available.",
                timestamp: nowISO()
            }
        ]
    };
}


/* =========================================================
   6. TOAST NOTIFICATIONS
========================================================= */

function showToast(message, type = "success") {
    const container = byId("toast-container");

    if (!container) return;

    const icons = {
        success: "fa-circle-check",
        error: "fa-circle-xmark",
        warning: "fa-triangle-exclamation",
        info: "fa-circle-info"
    };

    const toast = document.createElement("div");

    toast.className = `toast ${type}`;

    toast.innerHTML = `
        <i class="fas ${icons[type] || icons.info}"></i>

        <div class="toast-content">
            <strong>${escapeHTML(type.toUpperCase())}</strong>
            <p>${escapeHTML(message)}</p>
        </div>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 4000);
}


/* =========================================================
   7. ACTIVITY AND NOTIFICATION MANAGEMENT
========================================================= */

function addActivity(title, description) {
    db.activities.unshift({
        id: createId(),
        title,
        description,
        timestamp: nowISO()
    });

    db.activities = db.activities.slice(0, 100);

    saveData();
}

function addNotification(title, message) {
    db.notifications.unshift({
        id: createId(),
        title,
        message,
        read: false,
        timestamp: nowISO()
    });

    db.notifications = db.notifications.slice(0, 100);

    saveData();
    renderNotificationCount();
}

function renderNotificationCount() {
    const unread = db.notifications.filter(
        notification => !notification.read
    ).length;

    const badge = byId("notification-count");

    badge.textContent = unread > 99 ? "99+" : unread;

    badge.classList.toggle("hidden", unread === 0);
}

function renderNotifications() {
    const container = byId("notifications-list");

    if (!db.notifications.length) {
        container.innerHTML = emptyMessage(
            "You have no notifications."
        );
        return;
    }

    container.innerHTML = db.notifications.map(item => `
        <div class="notification-item ${item.read ? "" : "unread"}">

            <div class="notification-icon">
                <i class="fas fa-bell"></i>
            </div>

            <div class="notification-content">
                <h4>${escapeHTML(item.title)}</h4>
                <p>${escapeHTML(item.message)}</p>
                <small>${formatDateTime(item.timestamp)}</small>
            </div>

            ${item.read ? "" : '<span class="notification-dot"></span>'}

        </div>
    `).join("");
}

function markAllNotificationsRead() {
    db.notifications.forEach(item => {
        item.read = true;
    });

    saveData();

    renderNotifications();
    renderNotificationCount();

    showToast("All notifications marked as read.");
}


/* =========================================================
   8. SIMULATED AUTHENTICATION
========================================================= */

function showAuthPanel(panel) {
    byId("login-panel").classList.toggle(
        "hidden",
        panel !== "login"
    );

    byId("register-panel").classList.toggle(
        "hidden",
        panel !== "register"
    );
}

function login(event) {
    event.preventDefault();

    const email = normalize(byId("login-email").value);
    const password = byId("login-password").value;

    const user = db.users.find(
        item =>
            normalize(item.email) === email &&
            item.password === password
    );

    if (!user) {
        showToast("Invalid email or password.", "error");
        return;
    }

    currentUser = user;

    saveSession();

    byId("login-form").reset();

    showApplication();

    showToast(`Welcome, ${user.name}!`);
}

function registerAccount(event) {
    event.preventDefault();

    const name = byId("account-name").value.trim();
    const email = normalize(byId("account-email").value);
    const password = byId("account-password").value;
    const confirmPassword =
        byId("account-confirm-password").value;

    if (name.length < 2) {
        showToast("Enter a valid name.", "error");
        return;
    }

    if (password.length < 8) {
        showToast(
            "Password must contain at least 8 characters.",
            "error"
        );
        return;
    }

    if (password !== confirmPassword) {
        showToast("Passwords do not match.", "error");
        return;
    }

    if (
        db.users.some(
            user => normalize(user.email) === email
        )
    ) {
        showToast(
            "An account with this email already exists.",
            "error"
        );
        return;
    }

    const user = {
        id: createId(),
        name,
        email,
        password,
        role: "client"
    };

    db.users.push(user);

    if (!saveData()) {
        db.users = db.users.filter(item => item.id !== user.id);
        return;
    }

    currentUser = user;

    saveSession();

    byId("account-register-form").reset();

    showApplication();

    addNotification(
        "New Account Registered",
        `${name} created a client demonstration account.`
    );

    showToast("Account created successfully.");
}

function logout() {
    currentUser = null;

    saveSession();

    byId("app").classList.add("hidden");

    byId("auth-screen").classList.remove("hidden");

    closeSidebar();

    showAuthPanel("login");

    showToast("You have been logged out.", "info");
}

function showApplication() {
    byId("auth-screen").classList.add("hidden");

    byId("app").classList.remove("hidden");

    const roleLabel = isStaff()
        ? "Administrator"
        : "Client";

    byId("sidebar-username").textContent = currentUser.name;
    byId("sidebar-role").textContent = roleLabel;

    byId("topbar-username").textContent = currentUser.name;
    byId("topbar-role").textContent = roleLabel;

    byId("settings-name").textContent = currentUser.name;
    byId("settings-email").textContent = currentUser.email;
    byId("settings-role").textContent = roleLabel;

    applyRolePermissions();

    renderAll();

    navigate("dashboard");
}

function applyRolePermissions() {
    const staffOnlyPages = [
        "reports",
        "inquiries",
        "success-stories",
        "notifications"
    ];

    staffOnlyPages.forEach(page => {
        $$(`[data-page="${page}"]`).forEach(link => {
            link.classList.toggle("hidden", !isStaff());
        });
    });

    byId("add-story-button").classList.toggle(
        "hidden",
        !isStaff()
    );

    byId("add-inquiry-button").classList.toggle(
        "hidden",
        !isStaff()
    );

    byId("reset-demo-data").classList.toggle(
        "hidden",
        !isStaff()
    );

    byId("notification-button").classList.toggle(
        "hidden",
        !isStaff()
    );
}


/* =========================================================
   9. NAVIGATION
========================================================= */

const pageNames = {
    dashboard: "Dashboard",
    clients: "Client Directory",
    "register-client": "Register Client",
    "profile-detail": "Profile Detail",
    matches: "Matchmaking",
    inquiries: "Inquiries",
    messages: "Messages",
    "success-stories": "Success Stories",
    reports: "Reports & Analytics",
    notifications: "Notifications",
    settings: "Settings"
};

function navigate(page) {
    if (!currentUser) return;

    if (!pageNames[page]) {
        page = "dashboard";
    }

    const staffOnly = [
        "reports",
        "inquiries",
        "success-stories",
        "notifications"
    ];

    if (staffOnly.includes(page) && !isStaff()) {
        showToast("Access restricted to bureau staff.", "error");
        page = "dashboard";
    }

    $$(".page-section").forEach(section => {
        section.classList.toggle(
            "active",
            section.id === page
        );
    });

    $$(".nav-link").forEach(link => {
        link.classList.toggle(
            "active",
            link.dataset.page === page
        );
    });

    byId("breadcrumb-current").textContent = pageNames[page];

    closeSidebar();

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });

    if (page === "dashboard") renderDashboard();
    if (page === "clients") renderClients();
    if (page === "matches") renderMatchPage();
    if (page === "inquiries") renderInquiries();
    if (page === "messages") renderMessages();
    if (page === "success-stories") renderStories();
    if (page === "reports") renderReports();
    if (page === "notifications") renderNotifications();

    if (page === "register-client" && !editingClientId) {
        resetClientForm();
    }

    history.replaceState(null, "", `#${page}`);
}

function toggleSidebar() {
    const sidebar = byId("sidebar");
    const overlay = byId("sidebar-overlay");

    const isOpen = sidebar.classList.toggle("open");

    overlay.classList.toggle("active", isOpen);

    byId("menu-toggle").setAttribute(
        "aria-expanded",
        String(isOpen)
    );
}

function closeSidebar() {
    byId("sidebar").classList.remove("open");
    byId("sidebar-overlay").classList.remove("active");

    byId("menu-toggle").setAttribute(
        "aria-expanded",
        "false"
    );
}


/* =========================================================
   10. DASHBOARD
========================================================= */

function renderDashboard() {
    const clients = visibleClients();

    const relevantMatches = isStaff()
        ? db.matches
        : db.matches.filter(match =>
            ownedClients().some(client =>
                client.id === match.clientId ||
                client.id === match.matchedClientId
            )
        );

    byId("stat-total-clients").textContent = clients.length;

    byId("stat-active-matches").textContent =
        relevantMatches.filter(
            match => match.status === "Active"
        ).length;

    byId("stat-inquiries").textContent = isStaff()
        ? db.inquiries.length
        : db.inquiries.filter(inquiry =>
            ownedClients().some(
                client => client.id === inquiry.clientId
            )
        ).length;

    byId("stat-success").textContent = db.stories.length;

    renderRecentClients();
    renderRecentActivity();
}

function renderRecentClients() {
    const container = byId("recent-clients");

    const clients = [...visibleClients()]
        .sort(
            (a, b) =>
                new Date(b.createdAt) - new Date(a.createdAt)
        )
        .slice(0, 5);

    if (!clients.length) {
        container.innerHTML = emptyMessage(
            "No clients registered yet."
        );
        return;
    }

    container.innerHTML = clients.map(client => `
        <div class="recent-client-item">

            <img
                src="${safeImage(client.photo)}"
                class="recent-client-avatar"
                alt="Profile illustration"
            >

            <div class="recent-client-info">
                <h4>${escapeHTML(client.name)}</h4>

                <p>
                    ${calculateAge(client.dob)} years ·
                    ${escapeHTML(client.location)}
                </p>
            </div>

            <button
                type="button"
                class="recent-client-action"
                data-action="view-client"
                data-id="${escapeHTML(client.id)}"
            >
                View
            </button>

        </div>
    `).join("");
}

function renderRecentActivity() {
    const container = byId("recent-activity");

    if (!isStaff()) {
        container.innerHTML = emptyMessage(
            "Bureau activity is available to staff."
        );
        return;
    }

    const activities = db.activities.slice(0, 5);

    if (!activities.length) {
        container.innerHTML = emptyMessage(
            "No recent activity."
        );
        return;
    }

    container.innerHTML = activities.map(item => `
        <div class="activity-item">

            <div class="activity-icon">
                <i class="fas fa-clock-rotate-left"></i>
            </div>

            <div class="activity-content">
                <strong>${escapeHTML(item.title)}</strong>
                <p>${escapeHTML(item.description)}</p>
            </div>

            <span class="activity-time">
                ${formatDate(item.timestamp)}
            </span>

        </div>
    `).join("");
}


/* =========================================================
   11. CLIENT DIRECTORY
========================================================= */

function getFilteredClients() {
    const search = normalize(byId("client-search").value);
    const gender = byId("filter-gender").value;
    const religion = byId("filter-religion").value;
    const status = byId("filter-status").value;

    return visibleClients().filter(client => {
        const searchable = [
            client.name,
            client.occupation,
            client.location,
            client.education,
            client.caste,
            client.religion
        ].join(" ").toLowerCase();

        return (
            (!search || searchable.includes(search)) &&
            (!gender || client.gender === gender) &&
            (!religion || client.religion === religion) &&
            (!status || client.status === status)
        );
    });
}

function statusBadge(status) {
    const classes = {
        Active: "badge-active",
        Pending: "badge-pending",
        Matched: "badge-matched",
        Married: "badge-married",
        Resolved: "badge-resolved",
        "In Progress": "badge-progress",
        Accepted: "badge-accepted",
        Rejected: "badge-rejected",
        Cancelled: "badge-cancelled"
    };

    return `
        <span class="badge ${classes[status] || "badge-pending"}">
            ${escapeHTML(status)}
        </span>
    `;
}

function clientCard(client) {
    const age = calculateAge(client.dob);

    return `
        <article class="client-card">

            <div class="client-card-image">

                <img
                    src="${safeImage(client.photo)}"
                    alt="Profile image for ${escapeHTML(client.name)}"
                    loading="lazy"
                >

                <div class="client-card-status">
                    ${statusBadge(client.status)}
                </div>

            </div>

            <div class="client-card-body">

                <div class="client-card-heading">
                    <h3>${escapeHTML(client.name)}</h3>
                    <span class="client-card-id">
                        ${escapeHTML(client.id)}
                    </span>
                </div>

                <p class="client-card-subtitle">
                    ${age} years ·
                    ${escapeHTML(client.gender)}
                </p>

                <div class="client-card-details">

                    <div class="client-detail-row">
                        <i class="fas fa-graduation-cap"></i>
                        <span>${escapeHTML(client.education)}</span>
                    </div>

                    <div class="client-detail-row">
                        <i class="fas fa-briefcase"></i>
                        <span>${escapeHTML(client.occupation)}</span>
                    </div>

                    <div class="client-detail-row">
                        <i class="fas fa-location-dot"></i>
                        <span>${escapeHTML(client.location)}</span>
                    </div>

                    <div class="client-detail-row">
                        <i class="fas fa-heart"></i>
                        <span>${escapeHTML(client.religion)}</span>
                    </div>

                </div>

                <div class="client-card-actions">

                    <button
                        type="button"
                        class="btn btn-primary btn-sm"
                        data-action="view-client"
                        data-id="${escapeHTML(client.id)}"
                    >
                        <i class="fas fa-eye"></i>
                        View Profile
                    </button>

                    ${
                        canManageClient(client)
                            ? `
                                <button
                                    type="button"
                                    class="btn btn-outline btn-sm"
                                    data-action="edit-client"
                                    data-id="${escapeHTML(client.id)}"
                                >
                                    <i class="fas fa-pen"></i>
                                </button>
                            `
                            : ""
                    }

                </div>

            </div>

        </article>
    `;
}

function renderClients() {
    const clients = getFilteredClients();

    byId("client-result-count").textContent =
        `${clients.length} client${clients.length === 1 ? "" : "s"} found`;

    byId("client-grid").innerHTML =
        clients.map(clientCard).join("");

    byId("clients-empty").classList.toggle(
        "hidden",
        clients.length > 0
    );
}

function clearClientFilters() {
    byId("client-search").value = "";
    byId("filter-gender").value = "";
    byId("filter-religion").value = "";
    byId("filter-status").value = "";

    renderClients();
}


/* =========================================================
   12. PROFILE DETAIL VIEW
========================================================= */

function detailRow(label, value) {
    return `
        <div class="profile-info-row">
            <span>${escapeHTML(label)}</span>
            <strong>${escapeHTML(value || "Not specified")}</strong>
        </div>
    `;
}

function profileSection(title, icon, rows) {
    return `
        <div class="profile-info-card">

            <h3>
                <i class="fas ${icon}"></i>
                ${escapeHTML(title)}
            </h3>

            ${rows}

        </div>
    `;
}

function viewClient(id) {
    const client = getClient(id);

    if (!client || !visibleClients().includes(client)) {
        showToast("Client profile not found.", "error");
        return;
    }

    selectedClientId = client.id;

    const preferences = client.preferences || {};

    const personal = [
        detailRow("Full Name", client.name),
        detailRow("Gender", client.gender),
        detailRow("Age", `${calculateAge(client.dob)} years`),
        detailRow("Date of Birth", formatDate(client.dob)),
        detailRow("Marital Status", client.maritalStatus),
        detailRow("Religion", client.religion),
        detailRow("Caste", client.caste),
        detailRow("Mother Tongue", client.motherTongue)
    ].join("");

    const family = [
        detailRow("Family Type", client.familyType),
        detailRow("Family Values", client.familyValues),
        detailRow("Father's Occupation", client.fatherOccupation),
        detailRow("Mother's Occupation", client.motherOccupation),
        detailRow("Siblings", String(client.siblings ?? 0))
    ].join("");

    const career = [
        detailRow("Education", client.education),
        detailRow("Occupation", client.occupation),
        detailRow("Annual Income", formatMoney(client.income)),
        detailRow("Working Location", client.location)
    ].join("");

    const partner = [
        detailRow(
            "Preferred Age",
            `${preferences.minAge || 18} - ${preferences.maxAge || 100}`
        ),
        detailRow("Preferred Gender", preferences.gender || "Any"),
        detailRow("Religion", preferences.religion || "Any"),
        detailRow("Caste", preferences.caste || "Any"),
        detailRow("Education", preferences.education || "Any"),
        detailRow("Occupation", preferences.occupation || "Any"),
        detailRow("Location", preferences.location || "Any")
    ].join("");

    const gallery = [
        client.photo,
        ...(client.gallery || [])
    ].filter(Boolean);

    byId("profile-detail-content").innerHTML = `

        <div class="profile-header-card">

            <img
                src="${safeImage(client.photo)}"
                class="profile-main-image"
                alt="Profile illustration"
            >

            <div class="profile-header-info">

                <h2>${escapeHTML(client.name)}</h2>

                ${statusBadge(client.status)}

                <div class="profile-meta">

                    <span>
                        <i class="fas fa-calendar"></i>
                        ${calculateAge(client.dob)} years
                    </span>

                    <span>
                        <i class="fas fa-location-dot"></i>
                        ${escapeHTML(client.location)}
                    </span>

                    <span>
                        <i class="fas fa-graduation-cap"></i>
                        ${escapeHTML(client.education)}
                    </span>

                </div>

            </div>

            <div class="profile-actions">

                ${
                    canManageClient(client)
                        ? `
                            <button
                                type="button"
                                class="btn btn-primary"
                                data-action="edit-client"
                                data-id="${escapeHTML(client.id)}"
                            >
                                <i class="fas fa-pen"></i>
                                Edit
                            </button>

                            <button
                                type="button"
                                class="btn btn-danger-outline"
                                data-action="delete-client"
                                data-id="${escapeHTML(client.id)}"
                            >
                                <i class="fas fa-trash"></i>
                                Delete
                            </button>
                        `
                        : ""
                }

                <button
                    type="button"
                    class="btn btn-outline"
                    data-action="match-client"
                    data-id="${escapeHTML(client.id)}"
                >
                    <i class="fas fa-heart"></i>
                    Find Matches
                </button>

            </div>

        </div>

        <div class="profile-details-grid">

            ${profileSection(
                "Personal Information",
                "fa-user",
                personal
            )}

            ${profileSection(
                "Family Details",
                "fa-house",
                family
            )}

            ${profileSection(
                "Education & Career",
                "fa-graduation-cap",
                career
            )}

            ${profileSection(
                "Partner Preferences",
                "fa-heart",
                partner
            )}

        </div>

        ${
            gallery.length
                ? `
                    <div class="card section-spacing">
                        <h3>Photo Gallery</h3>

                        <div class="profile-gallery">

                            ${gallery.map(image => `
                                <img
                                    src="${safeImage(image)}"
                                    alt="Client profile photograph"
                                >
                            `).join("")}

                        </div>
                    </div>
                `
                : ""
        }
    `;

    navigate("profile-detail");
}


/* =========================================================
   13. MULTI-STEP REGISTRATION
========================================================= */

function showStep(step) {
    currentStep = Math.max(1, Math.min(4, step));

    $$(".form-step").forEach(item => {
        item.classList.toggle(
            "active",
            Number(item.dataset.formStep) === currentStep
        );
    });

    $$(".step-item").forEach(item => {
        const itemStep = Number(item.dataset.step);

        item.classList.toggle(
            "active",
            itemStep === currentStep
        );

        item.classList.toggle(
            "completed",
            itemStep < currentStep
        );
    });

    byId("previous-step").classList.toggle(
        "hidden",
        currentStep === 1
    );

    byId("next-step").classList.toggle(
        "hidden",
        currentStep === 4
    );

    byId("submit-client").classList.toggle(
        "hidden",
        currentStep !== 4
    );
}

function validateStep(step) {
    const container = $(
        `.form-step[data-form-step="${step}"]`
    );

    if (!container) return false;

    const fields = Array.from(
        container.querySelectorAll("input, select, textarea")
    );

    for (const field of fields) {
        if (field.type === "file") continue;

        if (!field.checkValidity()) {
            field.reportValidity();
            return false;
        }
    }

    if (step === 1) {
        const dob = byId("client-dob").value;
        const age = calculateAge(dob);

        if (age < 18 || age > 100) {
            showToast(
                "Client age must be between 18 and 100 years.",
                "error"
            );
            return false;
        }
    }

    if (step === 4) {
        const minAge = Number(
            byId("preferred-min-age").value
        );

        const maxAge = Number(
            byId("preferred-max-age").value
        );

        if (minAge > maxAge) {
            showToast(
                "Minimum preferred age cannot exceed maximum age.",
                "error"
            );
            return false;
        }
    }

    return true;
}

function nextStep() {
    if (!validateStep(currentStep)) return;

    showStep(currentStep + 1);
}

function previousStep() {
    showStep(currentStep - 1);
}

function resetClientForm() {
    byId("client-registration-form").reset();

    editingClientId = null;
    clientPhotoData = "";

    byId("registration-title").textContent =
        "Register New Client";

    byId("photo-preview").innerHTML =
        '<i class="fas fa-camera"></i>';

    showStep(1);
}

function getFormValue(id) {
    return byId(id).value.trim();
}

function collectClientData() {
    const previous = editingClientId
        ? getClient(editingClientId)
        : null;

    return {
        id: previous?.id || createId(),

        ownerId: previous?.ownerId ||
            (isStaff() ? null : currentUser.id),

        name: getFormValue("client-name"),

        gender: getFormValue("client-gender"),

        dob: getFormValue("client-dob"),

        maritalStatus: getFormValue(
            "client-marital-status"
        ),

        religion: getFormValue("client-religion"),

        caste: getFormValue("client-caste"),

        motherTongue: getFormValue(
            "client-mother-tongue"
        ),

        status: isStaff()
            ? getFormValue("client-status")
            : previous?.status || "Pending",

        familyType: getFormValue("family-type"),

        familyValues: getFormValue("family-values"),

        fatherOccupation: getFormValue(
            "father-occupation"
        ),

        motherOccupation: getFormValue(
            "mother-occupation"
        ),

        siblings: Number(
            getFormValue("siblings-count")
        ),

        education: getFormValue("education-level"),

        occupation: getFormValue(
            "client-occupation"
        ),

        income: Number(
            getFormValue("annual-income")
        ),

        location: getFormValue(
            "working-location"
        ),

        preferences: {
            minAge: Number(
                getFormValue("preferred-min-age")
            ),

            maxAge: Number(
                getFormValue("preferred-max-age")
            ),

            gender: getFormValue(
                "preferred-gender"
            ),

            religion: getFormValue(
                "preferred-religion"
            ),

            caste: getFormValue(
                "preferred-caste"
            ),

            education: getFormValue(
                "preferred-education"
            ),

            occupation: getFormValue(
                "preferred-occupation"
            ),

            location: getFormValue(
                "preferred-location"
            )
        },

        photo: clientPhotoData || previous?.photo || "",

        gallery: previous?.gallery || [],

        createdAt: previous?.createdAt || nowISO()
    };
}

function saveClient(event) {
    event.preventDefault();

    for (let step = 1; step <= 4; step++) {
        if (!validateStep(step)) {
            showStep(step);
            return;
        }
    }

    if (editingClientId) {
        const existing = getClient(editingClientId);

        if (!existing || !canManageClient(existing)) {
            showToast("Permission denied.", "error");
            return;
        }
    }

    const client = collectClientData();

    if (editingClientId) {
        const index = db.clients.findIndex(
            item => item.id === editingClientId
        );

        db.clients[index] = client;

        addActivity(
            "Client Updated",
            `${client.name}'s profile was updated.`
        );

    } else {
        db.clients.unshift(client);

        addActivity(
            "New Client Registered",
            `${client.name} joined MatrimonyHub.`
        );
    }

    if (!saveData()) return;

    addNotification(
        editingClientId
            ? "Profile Updated"
            : "New Client Registration",
        `${client.name}'s profile was saved successfully.`
    );

    showToast(
        editingClientId
            ? "Client profile updated successfully."
            : "Client registered successfully."
    );

    resetClientForm();

    renderAll();

    viewClient(client.id);
}

function editClient(id) {
    const client = getClient(id);

    if (!client || !canManageClient(client)) {
        showToast("Permission denied.", "error");
        return;
    }

    resetClientForm();

    editingClientId = client.id;

    byId("registration-title").textContent =
        "Edit Client Profile";

    const values = {
        "client-name": client.name,
        "client-gender": client.gender,
        "client-dob": client.dob,
        "client-marital-status": client.maritalStatus,
        "client-religion": client.religion,
        "client-caste": client.caste,
        "client-mother-tongue": client.motherTongue,
        "client-status": client.status,

        "family-type": client.familyType,
        "family-values": client.familyValues,
        "father-occupation": client.fatherOccupation,
        "mother-occupation": client.motherOccupation,
        "siblings-count": client.siblings,

        "education-level": client.education,
        "client-occupation": client.occupation,
        "annual-income": client.income,
        "working-location": client.location,

        "preferred-min-age": client.preferences?.minAge,
        "preferred-max-age": client.preferences?.maxAge,
        "preferred-gender": client.preferences?.gender,
        "preferred-religion": client.preferences?.religion,
        "preferred-caste": client.preferences?.caste,
        "preferred-education": client.preferences?.education,
        "preferred-occupation": client.preferences?.occupation,
        "preferred-location": client.preferences?.location
    };

    Object.entries(values).forEach(([id, value]) => {
        const element = byId(id);

        if (element) {
            element.value = value ?? "";
        }
    });

    clientPhotoData = client.photo || "";

    if (clientPhotoData) {
        byId("photo-preview").innerHTML = `
            <img
                src="${safeImage(clientPhotoData)}"
                alt="Current profile photograph"
            >
        `;
    }

    showStep(1);

    navigate("register-client");
}

function deleteClient(id) {
    const client = getClient(id);

    if (!client || !canManageClient(client)) {
        showToast("Permission denied.", "error");
        return;
    }

    showConfirmation(
        `Delete ${client.name}'s profile? This action cannot be undone.`,
        () => {
            db.clients = db.clients.filter(
                item => item.id !== id
            );

            db.matches = db.matches.filter(
                match =>
                    match.clientId !== id &&
                    match.matchedClientId !== id
            );

            db.inquiries = db.inquiries.filter(
                inquiry => inquiry.clientId !== id
            );

            db.messages = db.messages.filter(
                message => message.clientId !== id
            );

            saveData();

            addActivity(
                "Client Deleted",
                `${client.name}'s profile was removed.`
            );

            renderAll();

            navigate("clients");

            showToast("Client deleted successfully.");
        }
    );
}


/* =========================================================
   14. IMAGE UPLOADS
========================================================= */

function readImage(file) {
    return new Promise((resolve, reject) => {
        if (!file) {
            resolve("");
            return;
        }

        const allowed = [
            "image/jpeg",
            "image/png",
            "image/webp"
        ];

        if (!allowed.includes(file.type)) {
            reject(
                new Error("Only JPG, PNG and WebP images are allowed.")
            );
            return;
        }

        if (file.size > CONFIG.maxImageSize) {
            reject(
                new Error("Image must be smaller than 1 MB.")
            );
            return;
        }

        const reader = new FileReader();

        reader.onload = () => {
            resolve(String(reader.result));
        };

        reader.onerror = () => {
            reject(new Error("Unable to read image."));
        };

        reader.readAsDataURL(file);
    });
}

async function handleClientPhoto(event) {
    const file = event.target.files[0];

    if (!file) return;

    try {
        clientPhotoData = await readImage(file);

        byId("photo-preview").innerHTML = `
            <img
                src="${safeImage(clientPhotoData)}"
                alt="Selected profile photograph"
            >
        `;

    } catch (error) {
        event.target.value = "";
        showToast(error.message, "error");
    }
}


/* =========================================================
   15. MATCHMAKING ENGINE
========================================================= */

function preferenceMatches(value, preference) {
    if (!preference || normalize(preference) === "any") {
        return true;
    }

    return normalize(value) === normalize(preference);
}

function calculateCompatibility(source, candidate) {
    if (!source || !candidate) return 0;

    if (source.id === candidate.id) return 0;

    if (
        source.status === "Married" ||
        candidate.status === "Married"
    ) {
        return 0;
    }

    if (
        source.status === "Pending" ||
        candidate.status === "Pending"
    ) {
        return 0;
    }

    const sourcePreference = source.preferences || {};
    const candidatePreference = candidate.preferences || {};

    const sourceAge = calculateAge(source.dob);
    const candidateAge = calculateAge(candidate.dob);

    const sourceGenderMatch = preferenceMatches(
        candidate.gender,
        sourcePreference.gender
    );

    const candidateGenderMatch = preferenceMatches(
        source.gender,
        candidatePreference.gender
    );

    if (!sourceGenderMatch || !candidateGenderMatch) {
        return 0;
    }

    const sourceAgeMatch =
        candidateAge >= Number(sourcePreference.minAge || 18) &&
        candidateAge <= Number(sourcePreference.maxAge || 100);

    const candidateAgeMatch =
        sourceAge >= Number(candidatePreference.minAge || 18) &&
        sourceAge <= Number(candidatePreference.maxAge || 100);

    if (!sourceAgeMatch || !candidateAgeMatch) {
        return 0;
    }

    const criteria = [
        {
            weight: 25,
            matches:
                preferenceMatches(
                    candidate.religion,
                    sourcePreference.religion
                ) &&
                preferenceMatches(
                    source.religion,
                    candidatePreference.religion
                )
        },

        {
            weight: 10,
            matches:
                preferenceMatches(
                    candidate.caste,
                    sourcePreference.caste
                ) &&
                preferenceMatches(
                    source.caste,
                    candidatePreference.caste
                )
        },

        {
            weight: 20,
            matches:
                preferenceMatches(
                    candidate.education,
                    sourcePreference.education
                ) &&
                preferenceMatches(
                    source.education,
                    candidatePreference.education
                )
        },

        {
            weight: 20,
            matches:
                preferenceMatches(
                    candidate.occupation,
                    sourcePreference.occupation
                ) &&
                preferenceMatches(
                    source.occupation,
                    candidatePreference.occupation
                )
        },

        {
            weight: 25,
            matches:
                preferenceMatches(
                    candidate.location,
                    sourcePreference.location
                ) &&
                preferenceMatches(
                    source.location,
                    candidatePreference.location
                )
        }
    ];

    let score = 0;

    criteria.forEach(criterion => {
        if (criterion.matches) {
            score += criterion.weight;
        }
    });

    return score;
}

function renderMatchPage() {
    const select = byId("match-client-select");

    const eligible = isStaff()
        ? db.clients.filter(
            client => client.status !== "Married"
        )
        : ownedClients().filter(
            client => client.status !== "Married"
        );

    select.innerHTML = `
        <option value="">Choose a client</option>

        ${eligible.map(client => `
            <option value="${escapeHTML(client.id)}">
                ${escapeHTML(client.name)}
            </option>
        `).join("")}
    `;

    if (
        selectedMatchClientId &&
        eligible.some(client =>
            client.id === selectedMatchClientId
        )
    ) {
        select.value = selectedMatchClientId;
    }

    renderSavedMatches();
}

function findMatches() {
    const id = byId("match-client-select").value;

    const source = getClient(id);

    if (!source) {
        showToast("Please select a client.", "warning");
        return;
    }

    if (!isStaff() && !canManageClient(source)) {
        showToast("Permission denied.", "error");
        return;
    }

    selectedMatchClientId = id;

    const results = visibleClients()
        .filter(client => client.id !== id)
        .map(client => ({
            client,
            score: calculateCompatibility(source, client)
        }))
        .filter(result => result.score > 0)
        .sort((a, b) => b.score - a.score);

    byId("match-results-header").classList.remove("hidden");

    byId("match-results-description").textContent =
        `${results.length} compatible profiles found for ${source.name}`;

    const container = byId("match-results");

    container.innerHTML = results.map(result => {
        const client = result.client;

        return `
            <article class="match-card">

                <div class="match-card-image">

                    <img
                        src="${safeImage(client.photo)}"
                        alt="Profile illustration"
                    >

                    <div class="match-score-badge">
                        <i class="fas fa-heart"></i>
                        ${result.score}%
                    </div>

                </div>

                <div class="match-card-body">

                    <h3>${escapeHTML(client.name)}</h3>

                    <p>
                        ${calculateAge(client.dob)} years ·
                        ${escapeHTML(client.location)}
                    </p>

                    <div class="client-card-details">

                        <div class="client-detail-row">
                            <i class="fas fa-graduation-cap"></i>
                            ${escapeHTML(client.education)}
                        </div>

                        <div class="client-detail-row">
                            <i class="fas fa-briefcase"></i>
                            ${escapeHTML(client.occupation)}
                        </div>

                    </div>

                    <div class="compatibility-section">

                        <div class="compatibility-header">
                            <span>Preference Match</span>
                            <strong>${result.score}%</strong>
                        </div>

                        <div class="progress-track">
                            <div
                                class="progress-fill"
                                style="width:${result.score}%"
                            ></div>
                        </div>

                    </div>

                    <div class="match-actions">

                        <button
                            type="button"
                            class="btn btn-outline btn-sm"
                            data-action="view-client"
                            data-id="${escapeHTML(client.id)}"
                        >
                            View
                        </button>

                        <button
                            type="button"
                            class="btn btn-primary btn-sm"
                            data-action="save-match"
                            data-id="${escapeHTML(client.id)}"
                        >
                            Save Match
                        </button>

                    </div>

                </div>

            </article>
        `;
    }).join("");

    byId("matches-empty").classList.toggle(
        "hidden",
        results.length > 0
    );

    if (!results.length) {
        byId("matches-empty").querySelector("h3").textContent =
            "No Compatible Matches";

        byId("matches-empty").querySelector("p").textContent =
            "No profiles satisfy the selected client's age and gender preferences.";
    }
}

function saveMatch(candidateId) {
    const source = getClient(selectedMatchClientId);
    const candidate = getClient(candidateId);

    if (!source || !candidate) return;

    if (!isStaff() && !canManageClient(source)) {
        showToast("Permission denied.", "error");
        return;
    }

    const score = calculateCompatibility(source, candidate);

    if (score <= 0) {
        showToast("These profiles are not compatible.", "error");
        return;
    }

    const existing = db.matches.some(match =>
        (
            match.clientId === source.id &&
            match.matchedClientId === candidate.id
        ) ||
        (
            match.clientId === candidate.id &&
            match.matchedClientId === source.id
        )
    );

    if (existing) {
        showToast("This match has already been saved.", "warning");
        return;
    }

    db.matches.unshift({
        id: createId(),
        clientId: source.id,
        matchedClientId: candidate.id,
        score,
        status: "Active",
        date: nowISO()
    });

    saveData();

    addActivity(
        "New Match Created",
        `${source.name} matched with ${candidate.name}.`
    );

    addNotification(
        "New Match Connection",
        `${source.name} and ${candidate.name} have a saved match.`
    );

    renderAll();

    showToast("Match saved successfully.");
}

function renderSavedMatches() {
    const container = byId("saved-matches");

    const matches = isStaff()
        ? db.matches
        : db.matches.filter(match =>
            ownedClients().some(client =>
                match.clientId === client.id ||
                match.matchedClientId === client.id
            )
        );

    if (!matches.length) {
        container.innerHTML = emptyMessage(
            "No saved matches yet."
        );
        return;
    }

    container.innerHTML = `
        <table class="data-table">

            <thead>
                <tr>
                    <th>Client</th>
                    <th>Matched With</th>
                    <th>Score</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th>Action</th>
                </tr>
            </thead>

            <tbody>

                ${matches.map(match => `
                    <tr>

                        <td>${escapeHTML(getClientName(match.clientId))}</td>

                        <td>${escapeHTML(getClientName(match.matchedClientId))}</td>

                        <td>
                            <strong>${match.score}%</strong>
                        </td>

                        <td>
                            ${statusBadge(match.status)}
                        </td>

                        <td>
                            ${formatDate(match.date)}
                        </td>

                        <td>
                            <button
                                type="button"
                                class="table-action-btn danger"
                                data-action="delete-match"
                                data-id="${escapeHTML(match.id)}"
                                aria-label="Delete match"
                            >
                                <i class="fas fa-trash"></i>
                            </button>
                        </td>

                    </tr>
                `).join("")}

            </tbody>

        </table>
    `;
}

function deleteMatch(id) {
    const match = db.matches.find(item => item.id === id);

    if (!match) return;

    const authorized = isStaff() ||
        ownedClients().some(client =>
            client.id === match.clientId ||
            client.id === match.matchedClientId
        );

    if (!authorized) {
        showToast("Permission denied.", "error");
        return;
    }

    showConfirmation(
        "Remove this saved match connection?",
        () => {
            db.matches = db.matches.filter(
                item => item.id !== id
            );

            saveData();
            renderAll();

            showToast("Match removed.");
        }
    );
}


/* =========================================================
   16. INQUIRY MANAGEMENT
========================================================= */

function renderInquiries() {
    if (!isStaff()) return;

    const filter = byId("inquiry-status-filter").value;

    const inquiries = db.inquiries.filter(
        inquiry => !filter || inquiry.status === filter
    );

    byId("inquiry-total").textContent = db.inquiries.length;

    byId("inquiry-pending").textContent =
        db.inquiries.filter(
            inquiry => inquiry.status === "Pending"
        ).length;

    byId("inquiry-resolved").textContent =
        db.inquiries.filter(
            inquiry => inquiry.status === "Resolved"
        ).length;

    const container = byId("inquiry-table");

    if (!inquiries.length) {
        container.innerHTML = emptyMessage(
            "No inquiries match the selected status."
        );
        return;
    }

    container.innerHTML = `
        <table class="data-table">

            <thead>
                <tr>
                    <th>Client</th>
                    <th>Subject</th>
                    <th>Message</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th>Actions</th>
                </tr>
            </thead>

            <tbody>

                ${inquiries.map(inquiry => `
                    <tr>

                        <td>
                            ${escapeHTML(getClientName(inquiry.clientId))}
                        </td>

                        <td>
                            ${escapeHTML(inquiry.subject)}
                        </td>

                        <td>
                            ${escapeHTML(inquiry.message)}
                        </td>

                        <td>
                            <select
                                class="small-select"
                                data-action="inquiry-status"
                                data-id="${escapeHTML(inquiry.id)}"
                                aria-label="Update inquiry status"
                            >

                                ${[
                                    "Pending",
                                    "In Progress",
                                    "Resolved"
                                ].map(status => `
                                    <option
                                        value="${status}"
                                        ${inquiry.status === status ? "selected" : ""}
                                    >
                                        ${status}
                                    </option>
                                `).join("")}

                            </select>
                        </td>

                        <td>
                            ${formatDate(inquiry.timestamp)}
                        </td>

                        <td>
                            <button
                                type="button"
                                class="table-action-btn danger"
                                data-action="delete-inquiry"
                                data-id="${escapeHTML(inquiry.id)}"
                                aria-label="Delete inquiry"
                            >
                                <i class="fas fa-trash"></i>
                            </button>
                        </td>

                    </tr>
                `).join("")}

            </tbody>

        </table>
    `;
}

function populateInquiryClients() {
    byId("inquiry-client").innerHTML = `
        <option value="">Select Client</option>

        ${db.clients.map(client => `
            <option value="${escapeHTML(client.id)}">
                ${escapeHTML(client.name)}
            </option>
        `).join("")}
    `;
}

function saveInquiry(event) {
    event.preventDefault();

    if (!requireStaff()) return;

    const clientId = byId("inquiry-client").value;
    const subject = getFormValue("inquiry-subject");
    const message = getFormValue("inquiry-message");
    const status = byId("inquiry-status").value;

    if (!getClient(clientId)) {
        showToast("Select a valid client.", "error");
        return;
    }

    if (!subject || !message) {
        showToast("Complete all required fields.", "error");
        return;
    }

    db.inquiries.unshift({
        id: createId(),
        clientId,
        subject,
        message,
        status,
        timestamp: nowISO()
    });

    saveData();

    addActivity(
        "New Inquiry",
        `Inquiry created for ${getClientName(clientId)}.`
    );

    addNotification(
        "Inquiry Created",
        `New inquiry: ${subject}`
    );

    byId("inquiry-form").reset();

    closeModal("inquiry-modal");

    renderAll();

    showToast("Inquiry saved successfully.");
}

function updateInquiryStatus(id, status) {
    if (!requireStaff()) return;

    const inquiry = db.inquiries.find(
        item => item.id === id
    );

    if (!inquiry) return;

    if (!["Pending", "In Progress", "Resolved"].includes(status)) {
        showToast("Invalid inquiry status.", "error");
        return;
    }

    inquiry.status = status;

    saveData();

    renderInquiries();

    showToast("Inquiry status updated.");
}

function deleteInquiry(id) {
    if (!requireStaff()) return;

    showConfirmation(
        "Delete this inquiry?",
        () => {
            db.inquiries = db.inquiries.filter(
                item => item.id !== id
            );

            saveData();

            renderAll();

            showToast("Inquiry deleted.");
        }
    );
}


/* =========================================================
   17. INTERNAL MESSAGING
========================================================= */

function renderMessages() {
    renderConversationList();

    if (selectedChatClientId) {
        renderChat();
    }
}

function renderConversationList() {
    const container = byId("conversation-list");

    const search = normalize(
        byId("conversation-search").value
    );

    const clients = (isStaff()
        ? db.clients
        : ownedClients()
    ).filter(
        client => normalize(client.name).includes(search)
    );

    if (!clients.length) {
        container.innerHTML = `
            <div style="padding:20px">
                <p>No conversations found.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = clients.map(client => {
        const messages = db.messages
            .filter(message => message.clientId === client.id)
            .sort(
                (a, b) =>
                    new Date(a.timestamp) -
                    new Date(b.timestamp)
            );

        const latest = messages.at(-1);

        return `
            <button
                type="button"
                class="conversation-item ${
                    selectedChatClientId === client.id
                        ? "active"
                        : ""
                }"
                data-action="open-chat"
                data-id="${escapeHTML(client.id)}"
            >

                <img
                    src="${safeImage(client.photo)}"
                    class="conversation-avatar"
                    alt=""
                >

                <div class="conversation-info">

                    <strong>${escapeHTML(client.name)}</strong>

                    <p>
                        ${
                            latest
                                ? escapeHTML(latest.text)
                                : "Start a conversation"
                        }
                    </p>

                </div>

            </button>
        `;
    }).join("");
}

function openChat(id) {
    const client = getClient(id);

    if (!client) return;

    if (!isStaff() && !canManageClient(client)) {
        showToast("Permission denied.", "error");
        return;
    }

    selectedChatClientId = id;

    renderConversationList();
    renderChat();
}

function renderChat() {
    const client = getClient(selectedChatClientId);

    if (!client) return;

    byId("chat-header").innerHTML = `
        <div class="chat-header-user">

            <img
                src="${safeImage(client.photo)}"
                alt=""
            >

            <div>
                <h3>${escapeHTML(client.name)}</h3>
                <p>Internal Bureau Messaging</p>
            </div>

        </div>
    `;

    const messages = db.messages
        .filter(
            message => message.clientId === selectedChatClientId
        )
        .sort(
            (a, b) =>
                new Date(a.timestamp) -
                new Date(b.timestamp)
        );

    const container = byId("chat-messages");

    if (!messages.length) {
        container.innerHTML = `
            <div class="chat-empty">
                <i class="fas fa-comments"></i>
                <h3>No Messages Yet</h3>
                <p>Send the first message.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = messages.map(message => {
        const sentByCurrentUser = isStaff()
            ? message.sender === "staff"
            : message.sender !== "staff";

        return `
            <div class="chat-message ${
                sentByCurrentUser ? "sent" : "received"
            }">

                <div class="message-bubble">
                    ${escapeHTML(message.text)}
                </div>

                <span class="message-time">
                    ${formatDateTime(message.timestamp)}
                </span>

            </div>
        `;
    }).join("");

    container.scrollTop = container.scrollHeight;
}

function sendMessage(event) {
    event.preventDefault();

    const text = getFormValue("message-input");

    if (!selectedChatClientId) {
        showToast("Select a conversation.", "warning");
        return;
    }

    const client = getClient(selectedChatClientId);

    if (!client) return;

    if (!isStaff() && !canManageClient(client)) {
        showToast("Permission denied.", "error");
        return;
    }

    if (!text) {
        showToast("Message cannot be empty.", "error");
        return;
    }

    db.messages.push({
        id: createId(),
        clientId: selectedChatClientId,
        sender: isStaff() ? "staff" : currentUser.id,
        text,
        timestamp: nowISO()
    });

    saveData();

    byId("message-form").reset();

    renderMessages();

    showToast("Message saved successfully.");
}


/* =========================================================
   18. SUCCESS STORIES
========================================================= */

function renderStories() {
    const container = byId("success-stories-grid");

    byId("success-banner-count").textContent =
        db.stories.length;

    byId("stories-empty").classList.toggle(
        "hidden",
        db.stories.length > 0
    );

    container.innerHTML = db.stories.map(story => `
        <article class="story-card">

            <div class="story-image">

                ${
                    story.image
                        ? `
                            <img
                                src="${safeImage(story.image)}"
                                alt="Success story photograph"
                            >
                        `
                        : `
                            <div class="story-image-placeholder">
                                <i class="fas fa-heart"></i>
                            </div>
                        `
                }

            </div>

            <div class="story-body">

                <h3>${escapeHTML(story.coupleName)}</h3>

                <div class="story-date">
                    <i class="fas fa-calendar"></i>
                    ${formatDate(story.date)}
                </div>

                <p class="story-description">
                    ${escapeHTML(story.story)}
                </p>

                ${
                    isStaff()
                        ? `
                            <div class="story-actions">

                                <button
                                    type="button"
                                    class="btn btn-danger-outline btn-sm"
                                    data-action="delete-story"
                                    data-id="${escapeHTML(story.id)}"
                                >
                                    <i class="fas fa-trash"></i>
                                    Delete
                                </button>

                            </div>
                        `
                        : ""
                }

            </div>

        </article>
    `).join("");
}

async function handleStoryPhoto(event) {
    const file = event.target.files[0];

    if (!file) return;

    try {
        storyPhotoData = await readImage(file);
    } catch (error) {
        event.target.value = "";
        showToast(error.message, "error");
    }
}

function saveStory(event) {
    event.preventDefault();

    if (!requireStaff()) return;

    const coupleName = getFormValue("story-couple");
    const date = getFormValue("story-date");
    const story = getFormValue("story-description");

    if (!coupleName || !date || !story) {
        showToast("Complete all required fields.", "error");
        return;
    }

    db.stories.unshift({
        id: createId(),
        coupleName,
        date,
        story,
        image: storyPhotoData
    });

    saveData();

    addActivity(
        "Success Story Added",
        `${coupleName}'s success story was published.`
    );

    addNotification(
        "New Success Story",
        `${coupleName}'s story was added.`
    );

    byId("story-form").reset();

    storyPhotoData = "";

    closeModal("story-modal");

    renderAll();

    showToast("Success story added successfully.");
}

function deleteStory(id) {
    if (!requireStaff()) return;

    showConfirmation(
        "Delete this success story?",
        () => {
            db.stories = db.stories.filter(
                story => story.id !== id
            );

            saveData();

            renderAll();

            showToast("Success story deleted.");
        }
    );
}


/* =========================================================
   19. REPORTS AND ANALYTICS
========================================================= */

function countBy(items, property) {
    return items.reduce((result, item) => {
        const key = item[property] || "Not Specified";

        result[key] = (result[key] || 0) + 1;

        return result;
    }, {});
}

function renderChart(containerId, values) {
    const container = byId(containerId);

    const entries = Object.entries(values);

    if (!entries.length) {
        container.innerHTML = "<p>No data available.</p>";
        return;
    }

    const total = entries.reduce(
        (sum, [, count]) => sum + count,
        0
    );

    container.innerHTML = entries.map(([label, count]) => {
        const percentage = total
            ? Math.round((count / total) * 100)
            : 0;

        return `
            <div class="chart-item">

                <div class="chart-label">

                    <span>${escapeHTML(label)}</span>

                    <strong>
                        ${count} (${percentage}%)
                    </strong>

                </div>

                <div class="chart-track">

                    <div
                        class="chart-fill"
                        style="width:${percentage}%"
                    ></div>

                </div>

            </div>
        `;
    }).join("");
}

function renderReports() {
    if (!isStaff()) return;

    const totalClients = db.clients.length;
    const totalMatches = db.matches.length;
    const totalStories = db.stories.length;

    const successRate = totalMatches
        ? Math.min(
            100,
            Math.round((totalStories / totalMatches) * 100)
        )
        : 0;

    byId("report-total-clients").textContent =
        totalClients;

    byId("report-total-matches").textContent =
        totalMatches;

    byId("report-success-count").textContent =
        totalStories;

    byId("report-success-rate").textContent =
        `${successRate}%`;

    renderChart(
        "gender-report",
        countBy(db.clients, "gender")
    );

    renderChart(
        "status-report",
        countBy(db.clients, "status")
    );

    renderChart(
        "religion-report",
        countBy(db.clients, "religion")
    );

    renderChart(
        "match-report",
        countBy(db.matches, "status")
    );
}


/* =========================================================
   20. CSV EXPORT
========================================================= */

function csvValue(value) {
    const text = String(value ?? "");

    return `"${text.replace(/"/g, '""')}"`;
}

function exportClientsCSV() {
    const clients = isStaff()
        ? db.clients
        : ownedClients();

    if (!clients.length) {
        showToast("No clients available to export.", "warning");
        return;
    }

    const headers = [
        "ID",
        "Name",
        "Gender",
        "Age",
        "Date of Birth",
        "Marital Status",
        "Religion",
        "Caste",
        "Mother Tongue",
        "Family Type",
        "Family Values",
        "Father Occupation",
        "Mother Occupation",
        "Siblings",
        "Education",
        "Occupation",
        "Annual Income",
        "Location",
        "Status"
    ];

    const rows = clients.map(client => [
        client.id,
        client.name,
        client.gender,
        calculateAge(client.dob),
        client.dob,
        client.maritalStatus,
        client.religion,
        client.caste,
        client.motherTongue,
        client.familyType,
        client.familyValues,
        client.fatherOccupation,
        client.motherOccupation,
        client.siblings,
        client.education,
        client.occupation,
        client.income,
        client.location,
        client.status
    ]);

    const csv = [
        headers.map(csvValue).join(","),
        ...rows.map(row => row.map(csvValue).join(","))
    ].join("\r\n");

    const blob = new Blob(
        ["\uFEFF", csv],
        {
            type: "text/csv;charset=utf-8"
        }
    );

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;
    link.download = "matrimonyhub_clients.csv";

    document.body.appendChild(link);

    link.click();

    link.remove();

    URL.revokeObjectURL(url);

    showToast("Client CSV exported successfully.");
}


/* =========================================================
   21. DARK MODE
========================================================= */

function applyTheme(theme) {
    const dark = theme === "dark";

    document.body.classList.toggle(
        "dark-mode",
        dark
    );

    byId("dark-mode-setting").checked = dark;

    byId("theme-toggle").innerHTML = dark
        ? '<i class="fas fa-sun"></i>'
        : '<i class="fas fa-moon"></i>';

    try {
        localStorage.setItem(
            CONFIG.themeKey,
            dark ? "dark" : "light"
        );
    } catch (error) {
        console.error("Theme storage unavailable:", error);
    }
}

function toggleTheme() {
    const dark = document.body.classList.contains(
        "dark-mode"
    );

    applyTheme(dark ? "light" : "dark");
}

function restoreTheme() {
    let theme = "light";

    try {
        theme = localStorage.getItem(CONFIG.themeKey)
            || "light";
    } catch (error) {
        console.error(error);
    }

    applyTheme(theme);
}


/* =========================================================
   22. MODAL MANAGEMENT
========================================================= */

function openModal(id) {
    const modal = byId(id);

    if (!modal) return;

    lastFocusedElement = document.activeElement;

    modal.classList.remove("hidden");

    document.body.style.overflow = "hidden";

    const focusable = modal.querySelector(
        "input, select, textarea, button"
    );

    focusable?.focus();
}

function closeModal(id) {
    const modal = byId(id);

    if (!modal) return;

    modal.classList.add("hidden");

    const anyOpen = $$(".modal-overlay").some(
        item => !item.classList.contains("hidden")
    );

    if (!anyOpen) {
        document.body.style.overflow = "";
    }

    lastFocusedElement?.focus();
}

function showConfirmation(message, callback) {
    pendingConfirmation = callback;

    byId("confirm-modal-message").textContent = message;

    openModal("confirm-modal");
}

function acceptConfirmation() {
    const callback = pendingConfirmation;

    pendingConfirmation = null;

    closeModal("confirm-modal");

    if (typeof callback === "function") {
        callback();
    }
}


/* =========================================================
   23. RESET DEMONSTRATION DATA
========================================================= */

function resetDemoData() {
    if (!requireStaff()) return;

    showConfirmation(
        "Reset all demonstration data? Your changes will be permanently removed.",
        () => {
            createSampleData();

            if (!saveData()) return;

            selectedChatClientId = null;
            selectedMatchClientId = null;
            selectedClientId = null;

            resetClientForm();

            renderAll();

            navigate("dashboard");

            showToast("Demo data restored successfully.");
        }
    );
}


/* =========================================================
   24. APPLICATION RENDERING
========================================================= */

function renderAll() {
    if (!currentUser) return;

    renderDashboard();
    renderClients();
    renderMatchPage();
    renderInquiries();
    renderMessages();
    renderStories();
    renderReports();
    renderNotifications();
    renderNotificationCount();

    populateInquiryClients();
}


/* =========================================================
   25. EVENT DELEGATION
========================================================= */

function handleDocumentClick(event) {
    const navigation = event.target.closest(
        "[data-navigate]"
    );

    if (navigation) {
        event.preventDefault();

        if (navigation.dataset.navigate === "register-client") {
            resetClientForm();
        }

        navigate(navigation.dataset.navigate);
        return;
    }

    const navLink = event.target.closest(
        ".nav-link[data-page]"
    );

    if (navLink) {
        event.preventDefault();

        if (navLink.dataset.page === "register-client") {
            resetClientForm();
        }

        navigate(navLink.dataset.page);
        return;
    }

    const closeButton = event.target.closest(
        "[data-close-modal]"
    );

    if (closeButton) {
        closeModal(closeButton.dataset.closeModal);
        return;
    }

    const action = event.target.closest(
        "[data-action]"
    );

    if (!action) return;

    const id = action.dataset.id;

    switch (action.dataset.action) {
        case "view-client":
            viewClient(id);
            break;

        case "edit-client":
            editClient(id);
            break;

        case "delete-client":
            deleteClient(id);
            break;

        case "match-client":
            selectedMatchClientId = id;
            navigate("matches");
            byId("match-client-select").value = id;
            findMatches();
            break;

        case "save-match":
            saveMatch(id);
            break;

        case "delete-match":
            deleteMatch(id);
            break;

        case "delete-inquiry":
            deleteInquiry(id);
            break;

        case "open-chat":
            openChat(id);
            break;

        case "delete-story":
            deleteStory(id);
            break;
    }
}


/* =========================================================
   26. REGISTER EVENT LISTENERS
========================================================= */

function registerEvents() {
    document.addEventListener(
        "click",
        handleDocumentClick
    );

    byId("show-register").addEventListener(
        "click",
        () => showAuthPanel("register")
    );

    byId("show-login").addEventListener(
        "click",
        () => showAuthPanel("login")
    );

    byId("login-form").addEventListener(
        "submit",
        login
    );

    byId("account-register-form").addEventListener(
        "submit",
        registerAccount
    );

    byId("sidebar-logout").addEventListener(
        "click",
        logout
    );

    byId("menu-toggle").addEventListener(
        "click",
        toggleSidebar
    );

    byId("sidebar-overlay").addEventListener(
        "click",
        closeSidebar
    );

    byId("theme-toggle").addEventListener(
        "click",
        toggleTheme
    );

    byId("dark-mode-setting").addEventListener(
        "change",
        event => {
            applyTheme(
                event.target.checked ? "dark" : "light"
            );
        }
    );

    byId("notification-button").addEventListener(
        "click",
        () => navigate("notifications")
    );

    byId("clear-notifications").addEventListener(
        "click",
        markAllNotificationsRead
    );

    byId("client-search").addEventListener(
        "input",
        renderClients
    );

    [
        "filter-gender",
        "filter-religion",
        "filter-status"
    ].forEach(id => {
        byId(id).addEventListener(
            "change",
            renderClients
        );
    });

    byId("clear-client-filters").addEventListener(
        "click",
        clearClientFilters
    );

    byId("next-step").addEventListener(
        "click",
        nextStep
    );

    byId("previous-step").addEventListener(
        "click",
        previousStep
    );

    byId("cancel-registration").addEventListener(
        "click",
        () => {
            resetClientForm();
            navigate("clients");
        }
    );

    byId("client-registration-form").addEventListener(
        "submit",
        saveClient
    );

    byId("client-photo").addEventListener(
        "change",
        handleClientPhoto
    );

    byId("find-matches-btn").addEventListener(
        "click",
        findMatches
    );

    byId("match-client-select").addEventListener(
        "change",
        event => {
            selectedMatchClientId = event.target.value;
        }
    );

    byId("add-inquiry-button").addEventListener(
        "click",
        () => {
            if (!requireStaff()) return;

            populateInquiryClients();
            openModal("inquiry-modal");
        }
    );

    byId("inquiry-form").addEventListener(
        "submit",
        saveInquiry
    );

    byId("inquiry-status-filter").addEventListener(
        "change",
        renderInquiries
    );

    byId("inquiry-table").addEventListener(
        "change",
        event => {
            const target = event.target;

            if (
                target.dataset.action === "inquiry-status"
            ) {
                updateInquiryStatus(
                    target.dataset.id,
                    target.value
                );
            }
        }
    );

    byId("conversation-search").addEventListener(
        "input",
        renderConversationList
    );

    byId("message-form").addEventListener(
        "submit",
        sendMessage
    );

    byId("add-story-button").addEventListener(
        "click",
        () => {
            if (!requireStaff()) return;

            storyPhotoData = "";

            openModal("story-modal");
        }
    );

    byId("story-image").addEventListener(
        "change",
        handleStoryPhoto
    );

    byId("story-form").addEventListener(
        "submit",
        saveStory
    );

    byId("export-csv-button").addEventListener(
        "click",
        exportClientsCSV
    );

    byId("settings-export").addEventListener(
        "click",
        exportClientsCSV
    );

    byId("reset-demo-data").addEventListener(
        "click",
        resetDemoData
    );

    byId("confirm-cancel").addEventListener(
        "click",
        () => {
            pendingConfirmation = null;
            closeModal("confirm-modal");
        }
    );

    byId("confirm-accept").addEventListener(
        "click",
        acceptConfirmation
    );

    $$(".modal-overlay").forEach(modal => {
        modal.addEventListener("click", event => {
            if (event.target === modal) {
                if (modal.id === "confirm-modal") {
                    pendingConfirmation = null;
                }

                closeModal(modal.id);
            }
        });
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            const modal = $$(".modal-overlay").find(
                item => !item.classList.contains("hidden")
            );

            if (modal) {
                if (modal.id === "confirm-modal") {
                    pendingConfirmation = null;
                }

                closeModal(modal.id);
            } else {
                closeSidebar();
            }
        }
    });

    window.addEventListener("hashchange", () => {
        if (!currentUser) return;

        const page = location.hash.slice(1);

        if (pageNames[page]) {
            navigate(page);
        }
    });
}


/* =========================================================
   27. INITIALIZE APPLICATION
========================================================= */

function initializeApplication() {
    loadData();

    restoreSession();

    registerEvents();

    restoreTheme();

    byId("current-year").textContent =
        new Date().getFullYear();

    const maximumDOB = new Date();

    maximumDOB.setFullYear(
        maximumDOB.getFullYear() - 18
    );

    byId("client-dob").max =
        maximumDOB.toISOString().slice(0, 10);

    byId("story-date").max =
        new Date().toISOString().slice(0, 10);

    if (currentUser) {
        showApplication();
    } else {
        byId("auth-screen").classList.remove("hidden");
        byId("app").classList.add("hidden");
        showAuthPanel("login");
    }

    console.info(
        "MatrimonyHub initialized successfully."
    );
}

document.addEventListener(
    "DOMContentLoaded",
    initializeApplication
);