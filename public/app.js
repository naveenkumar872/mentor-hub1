// ==================== Application State ====================
const state = {
    currentUser: null,
    currentPage: 'dashboard',
    theme: localStorage.getItem('theme') || 'light',
    currentProblem: null,
    currentTask: null,
    uploadType: 'task'
};


const API_BASE = 'https://mentor-hub-backend-tkil.onrender.com/api';

// ==================== Initialize App ====================
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initEventListeners();
    checkAuth();
    window.addEventListener('hashchange', handleHashChange);
    handleHashChange();
});

function initTheme() {
    document.documentElement.setAttribute('data-theme', state.theme);
}

function initEventListeners() {
    // Login form
    document.getElementById('login-form').addEventListener('submit', handleLogin);

    // Theme toggle
    document.getElementById('theme-toggle-btn').addEventListener('click', toggleTheme);

    // Logout
    document.getElementById('logout-btn').addEventListener('click', handleLogout);

    // Menu toggle (mobile)
    document.getElementById('menu-toggle').addEventListener('click', () => {
        document.querySelector('.sidebar').classList.toggle('open');
    });

    // Modal close buttons
    document.getElementById('close-editor-modal').addEventListener('click', closeEditorModal);
    document.getElementById('cancel-submission').addEventListener('click', closeEditorModal);
    document.getElementById('close-upload-modal').addEventListener('click', closeUploadModal);
    document.getElementById('cancel-upload').addEventListener('click', closeUploadModal);
    document.getElementById('close-report-modal').addEventListener('click', closeReportModal);
    document.getElementById('close-report-btn').addEventListener('click', closeReportModal);

    // Modal overlays
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', () => {
            closeEditorModal();
            closeUploadModal();
            closeReportModal();
        });
    });

    // Code editor tabs
    document.querySelectorAll('.submission-type .tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.submission-type .tab-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            const type = e.target.dataset.type;
            if (type === 'editor') {
                document.getElementById('editor-section').classList.remove('hidden');
                document.getElementById('file-upload-section').classList.add('hidden');
            } else {
                document.getElementById('editor-section').classList.add('hidden');
                document.getElementById('file-upload-section').classList.remove('hidden');
            }
        });
    });

    // File upload
    const fileInput = document.getElementById('file-input');
    const fileDropZone = document.getElementById('file-drop-zone');

    fileDropZone.addEventListener('click', () => fileInput.click());
    fileDropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        fileDropZone.style.borderColor = 'var(--primary)';
    });
    fileDropZone.addEventListener('dragleave', () => {
        fileDropZone.style.borderColor = 'var(--border-color)';
    });
    fileDropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        fileDropZone.style.borderColor = 'var(--border-color)';
        const file = e.dataTransfer.files[0];
        if (file) handleFileSelect(file);
    });
    fileInput.addEventListener('change', (e) => {
        if (e.target.files[0]) handleFileSelect(e.target.files[0]);
    });
    document.getElementById('remove-file').addEventListener('click', () => {
        fileInput.value = '';
        document.getElementById('file-preview').classList.add('hidden');
        document.getElementById('code-textarea').value = '';
    });

    // Submit code
    document.getElementById('submit-code').addEventListener('click', handleCodeSubmit);

    // Upload form
    document.getElementById('confirm-upload').addEventListener('click', handleUploadSubmit);
}

function checkAuth() {
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
        state.currentUser = JSON.parse(savedUser);
        showDashboard();
    }
}

// ==================== Auth Functions ====================
async function handleLogin(e) {
    if (e) e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('login-error');

    try {
        const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            errorEl.textContent = data.error || 'Login failed';
            errorEl.classList.add('show');
            return;
        }

        state.currentUser = data.user;
        localStorage.setItem('currentUser', JSON.stringify(data.user));
        errorEl.classList.remove('show');

        // After login, check if there's a pending hash navigation
        const hash = window.location.hash;
        showDashboard();

        if (hash === '#/admin' && data.user.role === 'admin') navigateTo('dashboard');
        else if (hash === '#/mentor' && data.user.role === 'mentor') navigateTo('dashboard');
        else if (hash === '#/student' && data.user.role === 'student') navigateTo('dashboard');

    } catch (error) {
        errorEl.textContent = 'Connection error. Please ensure the server is running.';
        errorEl.classList.add('show');
    }
}

function handleHashChange() {
    const hash = window.location.hash;
    if (!state.currentUser) {
        // Pre-fill login based on hash for demo convenience
        if (hash === '#/admin') {
            document.getElementById('email').value = 'admin@edu.com';
            document.getElementById('password').value = 'admin123';
        } else if (hash === '#/mentor') {
            document.getElementById('email').value = 'hemapriya@edu.com';
            document.getElementById('password').value = 'password123';
        } else if (hash === '#/student') {
            document.getElementById('email').value = 'prabanjan@edu.com';
            document.getElementById('password').value = 'password123';
        }
    } else {
        // Already logged in, could navigate but for now we stay on dashboard
    }
}

function handleLogout() {
    state.currentUser = null;
    localStorage.removeItem('currentUser');
    document.getElementById('login-page').classList.add('active');
    document.getElementById('dashboard').classList.add('hidden');
    document.getElementById('email').value = '';
    document.getElementById('password').value = '';
}

function toggleTheme() {
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', state.theme);
    localStorage.setItem('theme', state.theme);
}

// ==================== Dashboard Functions ====================
function showDashboard() {
    document.getElementById('login-page').classList.remove('active');
    document.getElementById('dashboard').classList.remove('hidden');

    // Update user info
    document.getElementById('user-avatar').textContent = state.currentUser.avatar || '👤';
    document.getElementById('user-name').textContent = state.currentUser.name;
    document.getElementById('user-role').textContent = state.currentUser.role;

    // Setup navigation based on role
    setupNavigation();

    // Load default page
    navigateTo('dashboard');
}

function setupNavigation() {
    const nav = document.getElementById('sidebar-nav');
    let navItems = [];

    switch (state.currentUser.role) {
        case 'student':
            navItems = [
                { id: 'dashboard', label: 'Dashboard', icon: 'home' },
                { id: 'tasks', label: 'Tasks', icon: 'clipboard' },
                { id: 'assignments', label: 'Assignments', icon: 'code' },
                { id: 'submissions', label: 'My Submissions', icon: 'send' }
            ];
            break;
        case 'mentor':
            navItems = [
                { id: 'dashboard', label: 'Dashboard', icon: 'home' },
                { id: 'upload-tasks', label: 'Upload Tasks', icon: 'upload' },
                { id: 'upload-problems', label: 'Upload Problems', icon: 'file-code' },
                { id: 'leaderboard', label: 'Leaderboard', icon: 'trophy' },
                { id: 'all-submissions', label: 'All Submissions', icon: 'list' }
            ];
            break;
        case 'admin':
            navItems = [
                { id: 'dashboard', label: 'Dashboard', icon: 'home' },
                { id: 'upload-tasks', label: 'Upload Tasks', icon: 'upload' },
                { id: 'upload-problems', label: 'Upload Problems', icon: 'file-code' },
                { id: 'allocations', label: 'Mentor-Student', icon: 'users' },
                { id: 'student-leaderboard', label: 'Student Leaderboard', icon: 'trophy' },
                { id: 'mentor-leaderboard', label: 'Mentor Leaderboard', icon: 'award' },
                { id: 'all-submissions', label: 'All Submissions', icon: 'list' }
            ];
            break;

    }

    nav.innerHTML = navItems.map(item => `
        <div class="nav-item" data-page="${item.id}">
            ${getIcon(item.icon)}
            <span>${item.label}</span>
        </div>
    `).join('');

    nav.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => navigateTo(item.dataset.page));
    });
}

function navigateTo(page) {
    state.currentPage = page;

    // Update active nav
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.page === page);
    });

    // Close mobile menu
    document.querySelector('.sidebar').classList.remove('open');

    // Load page content
    loadPageContent(page);
}

async function loadPageContent(page) {
    const content = document.getElementById('content-body');
    const pageTitle = document.getElementById('page-title');
    const pageSubtitle = document.getElementById('page-subtitle');

    content.innerHTML = '<div class="loading">Loading...</div>';

    try {
        switch (page) {
            case 'dashboard':
                await loadDashboard(content, pageTitle, pageSubtitle);
                break;
            case 'tasks':
                await loadStudentTasks(content, pageTitle, pageSubtitle);
                break;
            case 'assignments':
                await loadAssignments(content, pageTitle, pageSubtitle);
                break;
            case 'submissions':
                await loadMySubmissions(content, pageTitle, pageSubtitle);
                break;
            case 'upload-tasks':
                await loadUploadTasks(content, pageTitle, pageSubtitle);
                break;
            case 'upload-problems':
                await loadUploadProblems(content, pageTitle, pageSubtitle);
                break;
            case 'leaderboard':
            case 'student-leaderboard':
                await loadLeaderboard(content, pageTitle, pageSubtitle);
                break;
            case 'mentor-leaderboard':
                await loadMentorLeaderboard(content, pageTitle, pageSubtitle);
                break;
            case 'all-submissions':
                await loadAllSubmissions(content, pageTitle, pageSubtitle);
                break;
            case 'allocations':
                await loadAllocations(content, pageTitle, pageSubtitle);
                break;
        }
    } catch (error) {
        content.innerHTML = `<div class="error-state">Error loading content: ${error.message}</div>`;
    }
}

// ==================== Page Loaders ====================
async function loadDashboard(content, pageTitle, pageSubtitle) {
    pageTitle.textContent = 'Dashboard';
    pageSubtitle.textContent = `Welcome back, ${state.currentUser.name}!`;

    let stats = {};

    if (state.currentUser.role === 'student') {
        const response = await fetch(`${API_BASE}/analytics/student/${state.currentUser.id}`);
        stats = await response.json();

        content.innerHTML = `
            <div class="stats-grid">
                <div class="stat-card primary">
                    <div class="stat-header">
                        <div class="stat-icon">📊</div>
                    </div>
                    <div class="stat-value">${stats.avgScore || 0}</div>
                    <div class="stat-label">Average Score</div>
                </div>
                <div class="stat-card">
                    <div class="stat-header">
                        <div class="stat-icon">📝</div>
                    </div>
                    <div class="stat-value">${stats.totalSubmissions || 0}</div>
                    <div class="stat-label">Total Submissions</div>
                </div>
                <div class="stat-card">
                    <div class="stat-header">
                        <div class="stat-icon">✅</div>
                    </div>
                    <div class="stat-value">${stats.acceptedSubmissions || 0}</div>
                    <div class="stat-label">Accepted</div>
                </div>
                <div class="stat-card">
                    <div class="stat-header">
                        <div class="stat-icon">📋</div>
                    </div>
                    <div class="stat-value">${stats.completedTasks || 0}/${stats.totalTasks || 0}</div>
                    <div class="stat-label">Tasks Completed</div>
                </div>
            </div>
            <div class="table-container">
                <div class="table-header">
                    <h3>Quick Actions</h3>
                </div>
                <div style="padding: 24px; display: flex; gap: 16px; flex-wrap: wrap;">
                    <button class="btn-primary" onclick="navigateTo('tasks')">📋 View Tasks</button>
                    <button class="btn-primary" onclick="navigateTo('assignments')">💻 Solve Problems</button>
                    <button class="btn-secondary" onclick="navigateTo('submissions')">📄 My Submissions</button>
                </div>
            </div>
        `;
    } else if (state.currentUser.role === 'mentor') {
        const response = await fetch(`${API_BASE}/analytics/mentor/${state.currentUser.id}`);
        stats = await response.json();

        const subsRes = await fetch(`${API_BASE}/submissions?mentorId=${state.currentUser.id}`);
        const submissions = await subsRes.json();
        const recentSubs = submissions.slice(0, 5);

        content.innerHTML = `
            <div class="stats-grid">
                <div class="stat-card primary">
                    <div class="stat-header">
                        <div class="stat-icon">👥</div>
                    </div>
                    <div class="stat-value">${stats.totalStudents || 0}</div>
                    <div class="stat-label">Allocated Students</div>
                </div>
                <div class="stat-card">
                    <div class="stat-header">
                        <div class="stat-icon">📋</div>
                    </div>
                    <div class="stat-value">${stats.totalTasks || 0}</div>
                    <div class="stat-label">Tasks Uploaded</div>
                </div>
                <div class="stat-card">
                    <div class="stat-header">
                        <div class="stat-icon">💻</div>
                    </div>
                    <div class="stat-value">${stats.totalProblems || 0}</div>
                    <div class="stat-label">Problems Uploaded</div>
                </div>
                <div class="stat-card">
                    <div class="stat-header">
                        <div class="stat-icon">📊</div>
                    </div>
                    <div class="stat-value">${stats.avgScore || 0}%</div>
                    <div class="stat-label">Avg Student Score</div>
                </div>
            </div>

            <div class="grid-2-col">
                <div class="table-container">
                    <div class="table-header">
                        <h3>Quick Actions</h3>
                    </div>
                    <div style="padding: 24px; display: flex; flex-direction: column; gap: 12px;">
                        <button class="btn-primary" onclick="navigateTo('upload-tasks')" style="justify-content: flex-start;">
                            ${getIcon('upload')} 📤 Upload New Task
                        </button>
                        <button class="btn-primary" onclick="navigateTo('upload-problems')" style="justify-content: flex-start;">
                            ${getIcon('file-code')} 💻 Upload New Problem
                        </button>
                        <button class="btn-secondary" onclick="navigateTo('leaderboard')" style="justify-content: flex-start;">
                            ${getIcon('trophy')} 🏆 View Leaderboard
                        </button>
                    </div>
                </div>

                <div class="table-container">
                    <div class="table-header">
                        <h3>Recent Submissions</h3>
                        <button class="text-btn" onclick="navigateTo('all-submissions')">View All</button>
                    </div>
                    <div class="table-wrapper">
                        <table>
                            <thead>
                                <tr>
                                    <th>Student</th>
                                    <th>Score</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${recentSubs.length === 0 ? '<tr><td colspan="3" style="text-align:center;padding:20px;">No recent submissions</td></tr>' :
                recentSubs.map(s => `
                                    <tr>
                                        <td>Student #${s.studentId.split('-')[1]}</td>
                                        <td><strong>${s.score}/100</strong></td>
                                        <td>
                                            <button class="action-btn view" onclick="viewReport('${s.id}', true)">
                                                ${getIcon('eye')}
                                            </button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

    } else {
        const response = await fetch(`${API_BASE}/analytics/admin`);
        stats = await response.json();

        content.innerHTML = `
            <div class="stats-grid">
                <div class="stat-card primary">
                    <div class="stat-header">
                        <div class="stat-icon">👨‍🏫</div>
                    </div>
                    <div class="stat-value">${stats.totalMentors || 0}</div>
                    <div class="stat-label">Total Mentors</div>
                </div>
                <div class="stat-card">
                    <div class="stat-header">
                        <div class="stat-icon">👥</div>
                    </div>
                    <div class="stat-value">${stats.totalStudents || 0}</div>
                    <div class="stat-label">Total Students</div>
                </div>
                <div class="stat-card">
                    <div class="stat-header">
                        <div class="stat-icon">📝</div>
                    </div>
                    <div class="stat-value">${stats.totalSubmissions || 0}</div>
                    <div class="stat-label">Total Submissions</div>
                </div>
                <div class="stat-card">
                    <div class="stat-header">
                        <div class="stat-icon">✅</div>
                    </div>
                    <div class="stat-value">${stats.acceptedSubmissions || 0}</div>
                    <div class="stat-label">Accepted</div>
                </div>
            </div>
        `;
    }
}

async function loadStudentTasks(content, pageTitle, pageSubtitle) {
    pageTitle.textContent = 'Tasks';
    pageSubtitle.textContent = 'View and complete tasks assigned by your mentor';

    const response = await fetch(`${API_BASE}/students/${state.currentUser.id}/tasks`);
    const tasks = await response.json();

    if (tasks.length === 0) {
        content.innerHTML = `
            <div class="empty-state">
                ${getIcon('clipboard')}
                <h3>No Tasks Available</h3>
                <p>Your mentor hasn't uploaded any tasks yet.</p>
            </div>
        `;
        return;
    }

    content.innerHTML = `
        <div class="cards-grid">
            ${tasks.map(task => `
                <div class="item-card">
                    <div class="item-card-header">
                        <div>
                            <h3 class="item-card-title">${task.title}</h3>
                            <div class="item-card-meta">
                                <span>📅 ${new Date(task.createdAt).toLocaleDateString()}</span>
                            </div>
                        </div>
                        <span class="status-badge ${task.status}">${task.status}</span>
                    </div>
                    <div class="item-card-body">
                        <p>${task.description}</p>
                    </div>
                    <div class="item-card-footer">
                        <span class="difficulty-badge ${task.difficulty || 'medium'}">${task.difficulty || 'Medium'}</span>
                        <button class="btn-solve" onclick="openTaskEditor('${task.id}')">Submit Solution</button>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

async function loadAssignments(content, pageTitle, pageSubtitle) {
    pageTitle.textContent = 'Assignments';
    pageSubtitle.textContent = 'Solve coding and SQL problems';

    const response = await fetch(`${API_BASE}/students/${state.currentUser.id}/problems`);
    const problems = await response.json();

    if (problems.length === 0) {
        content.innerHTML = `
            <div class="empty-state">
                ${getIcon('code')}
                <h3>No Problems Available</h3>
                <p>Your mentor hasn't uploaded any problems yet.</p>
            </div>
        `;
        return;
    }

    content.innerHTML = `
        <div class="cards-grid">
            ${problems.map(problem => `
                <div class="item-card">
                    <div class="item-card-header">
                        <div>
                            <h3 class="item-card-title">${problem.title}</h3>
                            <div class="item-card-meta">
                                <span class="language-tag">${problem.language?.toUpperCase() || 'Python'}</span>
                                <span>${problem.type === 'sql' ? '🗄️ SQL' : '💻 Coding'}</span>
                            </div>
                        </div>
                    </div>
                    <div class="item-card-body">
                        <p>${problem.description}</p>
                    </div>
                    <div class="item-card-footer">
                        <span class="difficulty-badge ${problem.difficulty || 'medium'}">${problem.difficulty || 'Medium'}</span>
                        <button class="btn-solve" onclick="openProblemEditor('${problem.id}')">Solve</button>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

async function loadMySubmissions(content, pageTitle, pageSubtitle) {
    pageTitle.textContent = 'My Submissions';
    pageSubtitle.textContent = 'View your submission history and reports';

    const response = await fetch(`${API_BASE}/submissions?studentId=${state.currentUser.id}`);
    const submissions = await response.json();

    if (submissions.length === 0) {
        content.innerHTML = `
            <div class="empty-state">
                ${getIcon('send')}
                <h3>No Submissions Yet</h3>
                <p>Start solving problems to see your submissions here.</p>
                <button class="btn-primary" onclick="navigateTo('assignments')">Solve Problems</button>
            </div>
        `;
        return;
    }

    content.innerHTML = `
        <div class="table-container">
            <div class="table-header">
                <h3>Submission History</h3>
            </div>
            <div class="table-wrapper">
                <table>
                    <thead>
                        <tr>
                            <th>Submitted At</th>
                            <th>Type</th>
                            <th>Language</th>
                            <th>Score</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${submissions.map(sub => `
                            <tr>
                                <td>${new Date(sub.submittedAt).toLocaleString()}</td>
                                <td>${sub.problemId ? 'Problem' : 'Task'}</td>
                                <td><span class="language-tag">${sub.language?.toUpperCase() || 'N/A'}</span></td>
                                <td><strong>${sub.score}/100</strong></td>
                                <td><span class="status-badge ${sub.status}">${sub.status}</span></td>
                                <td>
                                    <div class="action-btns">
                                        <button class="action-btn view" onclick="viewReport('${sub.id}')" title="View Report">
                                            ${getIcon('eye')}
                                        </button>
                                        <button class="action-btn delete" onclick="deleteSubmission('${sub.id}')" title="Delete">
                                            ${getIcon('trash')}
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

async function loadUploadTasks(content, pageTitle, pageSubtitle) {
    pageTitle.textContent = 'Upload Tasks';
    pageSubtitle.textContent = 'Create and manage tasks for your students';

    const tasksRes = await fetch(`${API_BASE}/tasks?mentorId=${state.currentUser.id}`);
    const tasks = await tasksRes.json();

    let totalStudents = 0;
    if (state.currentUser.role === 'admin') {
        const studentsRes = await fetch(`${API_BASE}/users?role=student`);
        const students = await studentsRes.json();
        totalStudents = students.length;
    } else {
        const studentsRes = await fetch(`${API_BASE}/mentors/${state.currentUser.id}/students`);
        const students = await studentsRes.json();
        totalStudents = students.length;
    }

    content.innerHTML = `
        <div class="table-container">
            <div class="table-header">
                <h3>Upload New Task</h3>
                <button class="btn-primary" onclick="openUploadModal('task')">
                    ${getIcon('plus')} Add Task
                </button>
            </div>
        </div>
        <div class="table-container">
            <div class="table-header">
                <h3>Your Tasks</h3>
            </div>
            <div class="table-wrapper">
                <table>
                    <thead>
                        <tr>
                            <th>Title</th>
                            <th>Created</th>
                            <th>Completed</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tasks.length === 0 ? '<tr><td colspan="5" style="text-align:center;">No tasks uploaded yet</td></tr>' :
            tasks.map(task => {
                const completed = task.completedBy?.length || 0;
                const allComplete = completed >= totalStudents && totalStudents > 0;
                return `
                                <tr>
                                    <td><strong>${task.title}</strong></td>
                                    <td>${new Date(task.createdAt).toLocaleDateString()}</td>
                                    <td>${completed}/${totalStudents} students</td>
                                    <td><span class="status-badge ${task.status}">${task.status}</span></td>
                                    <td>
                                        <div class="action-btns">
                                            <button class="action-btn delete" onclick="deleteTask('${task.id}')" ${allComplete ? '' : 'disabled'} title="${allComplete ? 'Delete' : 'All students must complete first'}">
                                                ${getIcon('trash')}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            `;
            }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

async function loadUploadProblems(content, pageTitle, pageSubtitle) {
    pageTitle.textContent = 'Upload Problems';
    pageSubtitle.textContent = 'Create coding and SQL problems for your students';

    const problemsRes = await fetch(`${API_BASE}/problems?mentorId=${state.currentUser.id}`);
    const problems = await problemsRes.json();

    let totalStudents = 0;
    if (state.currentUser.role === 'admin') {
        const studentsRes = await fetch(`${API_BASE}/users?role=student`);
        const students = await studentsRes.json();
        totalStudents = students.length;
    } else {
        const studentsRes = await fetch(`${API_BASE}/mentors/${state.currentUser.id}/students`);
        const students = await studentsRes.json();
        totalStudents = students.length;
    }

    content.innerHTML = `
        <div class="table-container">
            <div class="table-header">
                <h3>Upload New Problem</h3>
                <button class="btn-primary" onclick="openUploadModal('problem')">
                    ${getIcon('plus')} Add Problem
                </button>
            </div>
        </div>
        <div class="table-container">
            <div class="table-header">
                <h3>Your Problems</h3>
            </div>
            <div class="table-wrapper">
                <table>
                    <thead>
                        <tr>
                            <th>Title</th>
                            <th>Language</th>
                            <th>Type</th>
                            <th>Completed</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${problems.length === 0 ? '<tr><td colspan="6" style="text-align:center;">No problems uploaded yet</td></tr>' :
            problems.map(problem => {
                const completed = problem.completedBy?.length || 0;
                const allComplete = completed >= totalStudents && totalStudents > 0;
                return `
                                <tr>
                                    <td><strong>${problem.title}</strong></td>
                                    <td><span class="language-tag">${problem.language?.toUpperCase()}</span></td>
                                    <td>${problem.type === 'sql' ? '🗄️ SQL' : '💻 Coding'}</td>
                                    <td>${completed}/${totalStudents}</td>
                                    <td><span class="status-badge ${problem.status}">${problem.status}</span></td>
                                    <td>
                                        <div class="action-btns">
                                            <button class="action-btn delete" onclick="deleteProblem('${problem.id}')" ${allComplete ? '' : 'disabled'}>
                                                ${getIcon('trash')}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            `;
            }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

async function loadLeaderboard(content, pageTitle, pageSubtitle) {
    pageTitle.textContent = 'Student Leaderboard';
    pageSubtitle.textContent = 'Top performing students';

    let url = `${API_BASE}/leaderboard`;
    if (state.currentUser.role === 'mentor') {
        url += `?mentorId=${state.currentUser.id}`;
    }

    const response = await fetch(url);
    const leaderboard = await response.json();

    content.innerHTML = `
        <div class="table-container">
            <div class="table-header">
                <h3>🏆 Rankings</h3>
            </div>
            <div style="padding: 24px;">
                <div class="leaderboard-list">
                    ${leaderboard.map((student, index) => `
                        <div class="leaderboard-item ${index === 0 ? 'top-1' : index === 1 ? 'top-2' : index === 2 ? 'top-3' : ''}">
                            <div class="rank">${index + 1}</div>
                            <div class="leaderboard-avatar">${student.avatar || '🧑‍🎓'}</div>
                            <div class="leaderboard-info">
                                <div class="leaderboard-name">${student.name}</div>
                                <div class="leaderboard-stats">${student.acceptedSubmissions} accepted • ${student.totalSubmissions} total submissions</div>
                            </div>
                            <div class="leaderboard-score">
                                <div class="score-value">${student.avgScore}</div>
                                <div class="score-label">Avg Score</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
}

async function loadMentorLeaderboard(content, pageTitle, pageSubtitle) {
    pageTitle.textContent = 'Mentor Activity';
    pageSubtitle.textContent = 'Overview of mentor uploads and student completions';

    const mentorsRes = await fetch(`${API_BASE}/users?role=mentor`);
    const mentors = await mentorsRes.json();

    const tasksRes = await fetch(`${API_BASE}/tasks`);
    const tasks = await tasksRes.json();

    const problemsRes = await fetch(`${API_BASE}/problems`);
    const problems = await problemsRes.json();

    const mentorStats = mentors.map(mentor => {
        const mentorTasks = tasks.filter(t => t.mentorId === mentor.id);
        const mentorProblems = problems.filter(p => p.mentorId === mentor.id);
        const studentCount = mentor.allocatedStudents?.length || 0;

        return {
            ...mentor,
            tasksCount: mentorTasks.length,
            problemsCount: mentorProblems.length,
            studentCount
        };
    });

    content.innerHTML = `
        <div class="table-container">
            <div class="table-header">
                <h3>Mentor Overview</h3>
            </div>
            <div class="table-wrapper">
                <table>
                    <thead>
                        <tr>
                            <th>Mentor</th>
                            <th>Specialization</th>
                            <th>Students</th>
                            <th>Tasks</th>
                            <th>Problems</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${mentorStats.map(mentor => `
                            <tr>
                                <td>
                                    <div style="display:flex;align-items:center;gap:12px;">
                                        <span style="font-size:24px;">${mentor.avatar}</span>
                                        <strong>${mentor.name}</strong>
                                    </div>
                                </td>
                                <td>${mentor.specialization || 'N/A'}</td>
                                <td>${mentor.studentCount}</td>
                                <td>${mentor.tasksCount}</td>
                                <td>${mentor.problemsCount}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

async function loadAllocations(content, pageTitle, pageSubtitle) {
    pageTitle.textContent = 'Mentor-Student Allocations';
    pageSubtitle.textContent = 'View mentor and student assignments';

    const mentorsRes = await fetch(`${API_BASE}/users?role=mentor`);
    const mentors = await mentorsRes.json();

    const studentsRes = await fetch(`${API_BASE}/users?role=student`);
    const students = await studentsRes.json();

    const allocations = [];
    mentors.forEach(mentor => {
        const mentorStudents = students.filter(s => s.mentorId === mentor.id);
        mentorStudents.forEach(student => {
            allocations.push({ mentor, student });
        });
    });

    content.innerHTML = `
        <div class="table-container">
            <div class="table-header">
                <h3>Allocations Table</h3>
            </div>
            <div class="table-wrapper">
                <table>
                    <thead>
                        <tr>
                            <th>Mentor</th>
                            <th>Student</th>
                            <th>Batch</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${allocations.map(({ mentor, student }) => `
                            <tr>
                                <td>
                                    <div style="display:flex;align-items:center;gap:12px;">
                                        <span style="font-size:20px;">${mentor.avatar}</span>
                                        <div>
                                            <strong>${mentor.name}</strong>
                                            <div style="font-size:12px;color:var(--text-muted);">${mentor.email}</div>
                                        </div>
                                    </div>
                                </td>
                                <td>
                                    <div style="display:flex;align-items:center;gap:12px;">
                                        <span style="font-size:20px;">${student.avatar}</span>
                                        <div>
                                            <strong>${student.name}</strong>
                                            <div style="font-size:12px;color:var(--text-muted);">${student.email}</div>
                                        </div>
                                    </div>
                                </td>
                                <td><span class="language-tag">${student.batch}</span></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

async function loadAllSubmissions(content, pageTitle, pageSubtitle) {
    pageTitle.textContent = 'All Submissions';
    pageSubtitle.textContent = 'View all student submissions with detailed reports';

    let url = `${API_BASE}/submissions`;
    if (state.currentUser.role === 'mentor') {
        url += `?mentorId=${state.currentUser.id}`;
    }

    const response = await fetch(url);
    const submissions = await response.json();

    const usersRes = await fetch(`${API_BASE}/users?role=student`);
    const students = await usersRes.json();
    const studentMap = {};
    students.forEach(s => studentMap[s.id] = s);

    content.innerHTML = `
        <div class="table-container">
            <div class="table-header">
                <h3>Submissions (${submissions.length})</h3>
            </div>
            <div class="table-wrapper">
                <table>
                    <thead>
                        <tr>
                            <th>Student</th>
                            <th>Submitted</th>
                            <th>Language</th>
                            <th>Score</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${submissions.length === 0 ? '<tr><td colspan="6" style="text-align:center;">No submissions yet</td></tr>' :
            submissions.map(sub => {
                const student = studentMap[sub.studentId] || { name: 'Unknown', avatar: '👤' };
                return `
                                <tr>
                                    <td>
                                        <div style="display:flex;align-items:center;gap:10px;">
                                            <span>${student.avatar}</span>
                                            <strong>${student.name}</strong>
                                        </div>
                                    </td>
                                    <td>${new Date(sub.submittedAt).toLocaleString()}</td>
                                    <td><span class="language-tag">${sub.language?.toUpperCase() || 'N/A'}</span></td>
                                    <td><strong>${sub.score}/100</strong></td>
                                    <td><span class="status-badge ${sub.status}">${sub.status}</span></td>
                                    <td>
                                        <div class="action-btns">
                                            <button class="action-btn view" onclick="viewReport('${sub.id}', true)" title="View Report">
                                                ${getIcon('eye')}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            `;
            }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// ==================== Modal Functions ====================
window.openProblemEditor = async function (problemId) {
    const response = await fetch(`${API_BASE}/problems`);
    const problems = await response.json();
    const problem = problems.find(p => p.id === problemId);

    if (!problem) return;

    state.currentProblem = problem;
    state.currentTask = null;

    document.getElementById('editor-title').textContent = problem.title;
    document.getElementById('editor-problem-info').innerHTML = `
        <h4>${problem.title}</h4>
        <p>${problem.description}</p>
        ${problem.expectedOutput ? `<p><strong>Expected:</strong> ${problem.expectedOutput}</p>` : ''}
    `;
    document.getElementById('code-language').value = problem.language || 'python';
    document.getElementById('code-textarea').value = '';
    document.getElementById('submission-result').classList.add('hidden');
    document.getElementById('code-editor-modal').classList.remove('hidden');
};

window.openTaskEditor = async function (taskId) {
    const response = await fetch(`${API_BASE}/tasks`);
    const tasks = await response.json();
    const task = tasks.find(t => t.id === taskId);

    if (!task) return;

    state.currentTask = task;
    state.currentProblem = null;

    document.getElementById('editor-title').textContent = task.title;
    document.getElementById('editor-problem-info').innerHTML = `
        <h4>${task.title}</h4>
        <p>${task.description}</p>
    `;
    document.getElementById('code-textarea').value = '';
    document.getElementById('submission-result').classList.add('hidden');
    document.getElementById('code-editor-modal').classList.remove('hidden');
};

function closeEditorModal() {
    document.getElementById('code-editor-modal').classList.add('hidden');
    state.currentProblem = null;
    state.currentTask = null;
}

window.openUploadModal = function (type) {
    state.uploadType = type;
    document.getElementById('upload-modal-title').textContent = type === 'task' ? 'Upload Task' : 'Upload Problem';
    document.getElementById('problem-fields').style.display = type === 'problem' ? 'grid' : 'none';
    document.getElementById('item-title').value = '';
    document.getElementById('item-description').value = '';
    document.getElementById('item-expected').value = '';
    document.getElementById('upload-modal').classList.remove('hidden');
};

function closeUploadModal() {
    document.getElementById('upload-modal').classList.add('hidden');
}

function closeReportModal() {
    document.getElementById('report-modal').classList.add('hidden');
}

// ==================== Action Handlers ====================
function handleFileSelect(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('code-textarea').value = e.target.result;
        document.getElementById('file-name').textContent = file.name;
        document.getElementById('file-preview').classList.remove('hidden');
    };
    reader.readAsText(file);
}

async function handleCodeSubmit() {
    const code = document.getElementById('code-textarea').value;
    const language = document.getElementById('code-language').value;
    const resultDiv = document.getElementById('submission-result');

    if (!code.trim()) {
        alert('Please enter your code');
        return;
    }

    document.getElementById('submit-code').disabled = true;
    document.getElementById('submit-code').innerHTML = '<span>Evaluating...</span>';

    try {
        const response = await fetch(`${API_BASE}/submissions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                studentId: state.currentUser.id,
                problemId: state.currentProblem?.id || null,
                taskId: state.currentTask?.id || null,
                code,
                language,
                submissionType: 'editor'
            })
        });

        const result = await response.json();

        resultDiv.classList.remove('hidden', 'success', 'error');
        resultDiv.classList.add(result.status === 'accepted' ? 'success' : 'error');
        resultDiv.innerHTML = `
            <div class="result-header">
                <span class="icon">${result.status === 'accepted' ? '✅' : '❌'}</span>
                <h3>${result.status === 'accepted' ? 'Accepted!' : 'Rejected'}</h3>
            </div>
            <div class="result-score">Score: ${result.score}/100</div>
            <div class="result-feedback">${result.feedback}</div>
        `;
    } catch (error) {
        resultDiv.classList.remove('hidden', 'success');
        resultDiv.classList.add('error');
        resultDiv.innerHTML = `<p>Error submitting code: ${error.message}</p>`;
    }

    document.getElementById('submit-code').disabled = false;
    document.getElementById('submit-code').innerHTML = `${getIcon('send')}<span>Submit</span>`;
}

async function handleUploadSubmit() {
    const title = document.getElementById('item-title').value;
    const description = document.getElementById('item-description').value;
    const expectedOutput = document.getElementById('item-expected').value;
    const difficulty = document.getElementById('item-difficulty').value;

    if (!title || !description) {
        alert('Please fill in all required fields');
        return;
    }

    const data = {
        title,
        description,
        expectedOutput,
        difficulty,
        mentorId: state.currentUser.id
    };

    if (state.uploadType === 'problem') {
        data.type = document.getElementById('item-type').value;
        data.language = document.getElementById('item-language').value;
    }

    try {
        const endpoint = state.uploadType === 'task' ? 'tasks' : 'problems';
        await fetch(`${API_BASE}/${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        closeUploadModal();
        navigateTo(state.uploadType === 'task' ? 'upload-tasks' : 'upload-problems');
    } catch (error) {
        alert('Error uploading: ' + error.message);
    }
}

window.viewReport = async function (submissionId, showAiExplanation = false) {
    const response = await fetch(`${API_BASE}/submissions/${submissionId}`);
    const submission = await response.json();

    const usersRes = await fetch(`${API_BASE}/users?role=student`);
    const students = await usersRes.json();
    const student = students.find(s => s.id === submission.studentId) || { name: 'Unknown' };

    document.getElementById('report-content').innerHTML = `
        <div style="margin-bottom: 20px;">
            <h4 style="margin-bottom: 12px;">Student Information</h4>
            <p><strong>Name:</strong> ${student.name}</p>
            <p><strong>Submitted:</strong> ${new Date(submission.submittedAt).toLocaleString()}</p>
        </div>
        <div style="margin-bottom: 20px;">
            <h4 style="margin-bottom: 12px;">Result</h4>
            <p><strong>Score:</strong> ${submission.score}/100</p>
            <p><strong>Status:</strong> <span class="status-badge ${submission.status}">${submission.status}</span></p>
            <p><strong>Language:</strong> ${submission.language?.toUpperCase()}</p>
        </div>
        <div style="margin-bottom: 20px;">
            <h4 style="margin-bottom: 12px;">Feedback</h4>
            <p>${submission.feedback}</p>
        </div>
        ${showAiExplanation && submission.aiExplanation ? `
        <div style="margin-bottom: 20px; padding: 16px; background: var(--bg-tertiary); border-radius: var(--radius-md);">
            <h4 style="margin-bottom: 12px;">🤖 AI Evaluation Details</h4>
            <p>${submission.aiExplanation}</p>
        </div>
        ` : ''}
        <div>
            <h4 style="margin-bottom: 12px;">Submitted Code</h4>
            <pre style="background: var(--bg-tertiary); padding: 16px; border-radius: var(--radius-md); overflow-x: auto; font-family: monospace; font-size: 13px;">${escapeHtml(submission.code)}</pre>
        </div>
    `;

    document.getElementById('report-modal').classList.remove('hidden');
};

window.deleteSubmission = async function (id) {
    if (!confirm('Are you sure you want to delete this submission?')) return;

    await fetch(`${API_BASE}/submissions/${id}`, { method: 'DELETE' });
    navigateTo('submissions');
};

window.deleteTask = async function (id) {
    if (!confirm('Are you sure you want to delete this task?')) return;

    await fetch(`${API_BASE}/tasks/${id}`, { method: 'DELETE' });
    navigateTo('upload-tasks');
};

window.deleteProblem = async function (id) {
    if (!confirm('Are you sure you want to delete this problem?')) return;

    await fetch(`${API_BASE}/problems/${id}`, { method: 'DELETE' });
    navigateTo('upload-problems');
};

// ==================== Utility Functions ====================
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getIcon(name) {
    const icons = {
        home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
        clipboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>',
        code: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
        send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
        upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
        'file-code': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M10 13l-2 2 2 2"/><path d="M14 17l2-2-2-2"/></svg>',
        trophy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>',
        list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
        users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
        award: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>',
        plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
        eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
        trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>'
    };
    return icons[name] || '';
}
