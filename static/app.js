// PulseShare - Interactive Photo & Video Social Client

document.addEventListener('DOMContentLoaded', () => {
  // State
  let token = localStorage.getItem('token') || null;
  let user = null;
  try {
    user = JSON.parse(localStorage.getItem('user') || 'null');
  } catch (e) {
    user = null;
  }
  let currentFilter = 'all'; // 'all' | 'mine'
  let cachedPosts = [];
  let selectedFile = null;
  let authMode = 'login'; // 'login' | 'signup'

  // DOM Elements
  const navGuest = document.getElementById('nav-guest');
  const navUser = document.getElementById('nav-user');
  const navLoginBtn = document.getElementById('nav-login-btn');
  const navSignupBtn = document.getElementById('nav-signup-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const userAvatar = document.getElementById('user-avatar');
  const userEmailDisplay = document.getElementById('user-email-display');

  const uploadPanel = document.getElementById('upload-panel');
  const guestPanel = document.getElementById('guest-panel');
  const guestLoginBtn = document.getElementById('guest-login-btn');
  const guestSignupBtn = document.getElementById('guest-signup-btn');

  const uploadForm = document.getElementById('upload-form');
  const fileInput = document.getElementById('file-input');
  const dropzone = document.getElementById('dropzone');
  const dropzoneIdle = document.getElementById('dropzone-idle');
  const previewBox = document.getElementById('preview-box');
  const previewMediaContainer = document.getElementById('preview-media-container');
  const previewFilename = document.getElementById('preview-filename');
  const previewFilesize = document.getElementById('preview-filesize');
  const clearFileBtn = document.getElementById('clear-file-btn');
  const submitPostBtn = document.getElementById('submit-post-btn');
  const uploadSpinner = document.getElementById('upload-spinner');
  const uploadBtnText = document.getElementById('upload-btn-text');

  const feedCards = document.getElementById('feed-cards');
  const emptyFeed = document.getElementById('empty-feed');
  const feedLoader = document.getElementById('feed-loader');
  const postsCounter = document.getElementById('posts-counter');
  const refreshFeedBtn = document.getElementById('refresh-feed-btn');
  const feedFilterTabs = document.getElementById('feed-filter-tabs');

  // Modal Elements
  const authModal = document.getElementById('auth-modal');
  const modalCloseBtn = document.getElementById('modal-close-btn');
  const tabLogin = document.getElementById('tab-login');
  const tabSignup = document.getElementById('tab-signup');
  const authForm = document.getElementById('auth-form');
  const authEmail = document.getElementById('auth-email');
  const authPassword = document.getElementById('auth-password');
  const authHint = document.getElementById('auth-hint');
  const authSubmitBtn = document.getElementById('auth-submit-btn');
  const authSpinner = document.getElementById('auth-spinner');
  const authBtnText = document.getElementById('auth-btn-text');
  const authError = document.getElementById('auth-error');

  // Toast Elements
  const toast = document.getElementById('toast');
  const toastMessage = document.getElementById('toast-message');
  const toastIcon = document.getElementById('toast-icon');

  // Initialize UI & Auth
  init();

  
  async function init() {
    updateAuthUI();
    if (token) {
      // Validate session with /users/me
      try {
        const res = await fetch('/users/me', { headers: getAuthHeaders() });
        if (res.ok) {
          user = await res.json();
          localStorage.setItem('user', JSON.stringify(user));
          updateAuthUI();
          loadFeed();
        } else {
          // Token expired
          handleLogout(false);
        }
      } catch (err) {
        console.error('Session check failed:', err);
        loadFeed();
      }
    } else {
      loadFeed();
    }
  }

  function getAuthHeaders() {
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  function updateAuthUI() {
    if (token && user) {
      navGuest.classList.add('hidden');
      navUser.classList.remove('hidden');
      guestPanel.classList.add('hidden');
      uploadPanel.classList.remove('hidden');
      feedFilterTabs.classList.remove('hidden');

      userEmailDisplay.textContent = user.email;
      userAvatar.textContent = (user.email[0] || 'U').toUpperCase();
    } else {
      navUser.classList.add('hidden');
      navGuest.classList.remove('hidden');
      uploadPanel.classList.add('hidden');
      guestPanel.classList.remove('hidden');
      feedFilterTabs.classList.add('hidden');
    }
  }

  // --- Auth Modal & Flow ---
  navLoginBtn.addEventListener('click', () => openAuthModal('login'));
  guestLoginBtn.addEventListener('click', () => openAuthModal('login'));
  navSignupBtn.addEventListener('click', () => openAuthModal('signup'));
  guestSignupBtn.addEventListener('click', () => openAuthModal('signup'));
  modalCloseBtn.addEventListener('click', closeAuthModal);

  tabLogin.addEventListener('click', (e) => {
    e.preventDefault();
    setAuthMode('login');
  });

  tabSignup.addEventListener('click', (e) => {
    e.preventDefault();
    setAuthMode('signup');
  });

  authModal.addEventListener('click', (e) => {
    if (e.target === authModal) closeAuthModal();
  });

  function openAuthModal(mode) {
    setAuthMode(mode);
    authError.classList.add('hidden');
    authForm.reset();
    authModal.classList.remove('hidden');
    authEmail.focus();
  }

  function closeAuthModal() {
    authModal.classList.add('hidden');
  }

  const modalSwitchLink = document.getElementById('modal-switch-link');
  const modalSwitchPrompt = document.getElementById('modal-switch-prompt');

  if (modalSwitchLink) {
    modalSwitchLink.addEventListener('click', (e) => {
      e.preventDefault();
      setAuthMode(authMode === 'login' ? 'signup' : 'login');
    });
  }

  function setAuthMode(mode) {
    authMode = mode;
    authError.classList.add('hidden');

    if (mode === 'login') {
      tabLogin.classList.add('active');
      tabSignup.classList.remove('active');
      authBtnText.textContent = 'Sign In';
      authHint.textContent = 'Enter your email & password to sign in';
      if (modalSwitchPrompt) modalSwitchPrompt.textContent = "Don't have an account?";
      if (modalSwitchLink) modalSwitchLink.textContent = "Create Account";
    } else {
      tabSignup.classList.add('active');
      tabLogin.classList.remove('active');
      authBtnText.textContent = 'Create Account';
      authHint.textContent = 'Password must be at least 6 characters';
      if (modalSwitchPrompt) modalSwitchPrompt.textContent = "Already have an account?";
      if (modalSwitchLink) modalSwitchLink.textContent = "Sign In";
    }
  }

  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    authError.classList.add('hidden');

    const email = authEmail.value.trim();
    const password = authPassword.value;

    authSubmitBtn.disabled = true;
    authSpinner.classList.remove('hidden');
    authBtnText.textContent = authMode === 'login' ? 'Signing In...' : 'Creating Account...';

    try {
      if (authMode === 'signup') {
        // Register user
        const regRes = await fetch('/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });

        if (!regRes.ok) {
          const errData = await regRes.json().catch(() => ({}));
          let msg = errData.detail || 'Registration failed';
          if (msg === 'REGISTER_USER_ALREADY_EXISTS') {
            msg = 'This email is already registered! Please click "Sign In" above to log into your account.';
          } else if (msg === 'REGISTER_INVALID_PASSWORD') {
            msg = 'Password must be at least 6 characters.';
          }
          throw new Error(msg);
        }

        showToast('Account created successfully! Signing in...', 'success');
      }

      // Login to obtain JWT
      const loginParams = new URLSearchParams();
      loginParams.append('username', email);
      loginParams.append('password', password);

      const loginRes = await fetch('/auth/jwt/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: loginParams.toString(),
      });

      if (!loginRes.ok) {
        const errData = await loginRes.json().catch(() => ({}));
        let msg = errData.detail || 'Invalid email or password';
        if (msg === 'LOGIN_BAD_CREDENTIALS') {
          msg = 'Incorrect email or password. If you haven\'t created an account yet, click "Create Account" above!';
        }
        throw new Error(msg);
      }

      const tokenData = await loginRes.json();
      token = tokenData.access_token;
      localStorage.setItem('token', token);

      // Fetch user profile
      const userRes = await fetch('/users/me', { headers: getAuthHeaders() });
      if (userRes.ok) {
        user = await userRes.json();
        localStorage.setItem('user', JSON.stringify(user));
      }

      closeAuthModal();
      updateAuthUI();
      showToast(`Welcome, ${user ? user.email : 'User'}!`, 'success');
      loadFeed();
    } catch (err) {
      authError.textContent = err.message || 'Authentication error';
      authError.classList.remove('hidden');
    } finally {
      authSubmitBtn.disabled = false;
      authSpinner.classList.add('hidden');
      authBtnText.textContent = authMode === 'login' ? 'Sign In' : 'Create Account';
    }
  });

  logoutBtn.addEventListener('click', () => handleLogout(true));

  function handleLogout(showNotification = true) {
    token = null;
    user = null;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    updateAuthUI();
    cachedPosts = [];
    renderPosts([]);
    if (showNotification) {
      showToast('You have been signed out.', 'success');
    }
    loadFeed();
  }

  // --- Dropzone & Media Selection ---
  ['dragenter', 'dragover'].forEach((eventName) => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach((eventName) => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0) handleFileSelected(files[0]);
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) handleFileSelected(fileInput.files[0]);
  });

  clearFileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    clearSelectedFile();
  });

  function handleFileSelected(file) {
    selectedFile = file;
    previewFilename.textContent = file.name;
    previewFilesize.textContent = formatBytes(file.size);
    previewMediaContainer.innerHTML = '';

    if (file.type.startsWith('image/')) {
      const img = document.createElement('img');
      const reader = new FileReader();
      reader.onload = (e) => {
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
      previewMediaContainer.appendChild(img);
    } else if (file.type.startsWith('video/')) {
      const video = document.createElement('video');
      video.muted = true;
      video.autoplay = false;
      video.src = URL.createObjectURL(file);
      previewMediaContainer.appendChild(video);
    } else {
      previewMediaContainer.innerHTML = '<span style="font-size:1.8rem;">📁</span>';
    }

    dropzoneIdle.classList.add('hidden');
    previewBox.classList.remove('hidden');
  }

  function clearSelectedFile() {
    selectedFile = null;
    fileInput.value = '';
    previewMediaContainer.innerHTML = '';
    previewBox.classList.add('hidden');
    dropzoneIdle.classList.remove('hidden');
  }

  // --- Upload Post Submission ---
  uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!selectedFile) {
      showToast('Please select a photo or video to upload.', 'error');
      return;
    }

    if (!token) {
      openAuthModal('login');
      return;
    }

    const caption = document.getElementById('post-caption').value.trim();
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('caption', caption);

    submitPostBtn.disabled = true;
    uploadSpinner.classList.remove('hidden');
    uploadBtnText.textContent = 'Uploading media...';

    try {
      const res = await fetch('/upload', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData,
      });

      if (!res.ok) {
        if (res.status === 401) {
          handleLogout();
          openAuthModal('login');
          throw new Error('Session expired. Please sign in again.');
        }
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Upload failed (Status ${res.status})`);
      }

      showToast('Post published successfully!', 'success');
      uploadForm.reset();
      clearSelectedFile();

      // Refresh feed
      await loadFeed();
    } catch (err) {
      console.error('Upload Error:', err);
      showToast(err.message || 'Upload failed', 'error');
    } finally {
      submitPostBtn.disabled = false;
      uploadSpinner.classList.add('hidden');
      uploadBtnText.textContent = 'Share to Feed';
    }
  });

  // --- Feed Filter & Loading ---
  refreshFeedBtn.addEventListener('click', () => {
    const icon = refreshFeedBtn.querySelector('.refresh-icon');
    if (icon) icon.style.transform = 'rotate(360deg)';
    loadFeed().then(() => {
      setTimeout(() => {
        if (icon) icon.style.transform = '';
      }, 500);
    });
  });

  document.querySelectorAll('#feed-filter-tabs .tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#feed-filter-tabs .tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      applyFilterAndRender();
    });
  });

  async function loadFeed() {
    feedLoader.classList.remove('hidden');
    emptyFeed.classList.add('hidden');

    try {
      if (!token) {
        // Guest user: not authenticated
        cachedPosts = [];
        feedLoader.classList.add('hidden');
        renderPosts([]);
        return;
      }

      const res = await fetch('/feed', { headers: getAuthHeaders() });
      if (!res.ok) {
        if (res.status === 401) {
          handleLogout(false);
          cachedPosts = [];
          renderPosts([]);
          return;
        }
        throw new Error('Failed to load feed');
      }

      const data = await res.json();
      cachedPosts = data.posts || [];
      applyFilterAndRender();
    } catch (err) {
      console.error('Feed error:', err);
      showToast('Could not load feed: ' + err.message, 'error');
    } finally {
      feedLoader.classList.add('hidden');
    }
  }

  function applyFilterAndRender() {
    let filtered = cachedPosts;
    if (currentFilter === 'mine') {
      filtered = cachedPosts.filter((p) => p.is_owner);
    }
    postsCounter.textContent = `${filtered.length} post${filtered.length === 1 ? '' : 's'}`;
    renderPosts(filtered);
  }

  function renderPosts(posts) {
    feedCards.innerHTML = '';

    if (!token) {
      emptyFeed.classList.remove('hidden');
      emptyFeed.querySelector('h3').textContent = 'Sign in to view the feed';
      emptyFeed.querySelector('p').textContent = 'Create an account or log in to view and share photos & videos.';
      postsCounter.textContent = '0 posts';
      return;
    }

    if (posts.length === 0) {
      emptyFeed.classList.remove('hidden');
      emptyFeed.querySelector('h3').textContent = currentFilter === 'mine' ? 'No posts by you yet' : 'No posts yet';
      emptyFeed.querySelector('p').textContent = 'Use the upload studio on the left to share your first photo or video!';
      return;
    }

    emptyFeed.classList.add('hidden');

    posts.forEach((post) => {
      const card = document.createElement('article');
      card.className = 'post-card';
      card.id = `post-${post.id}`;

      const authorInitial = (post.email ? post.email[0] : 'U').toUpperCase();
      const timeAgo = formatTimeAgo(post.created_at);
      const isVideo = post.file_type === 'video';

      card.innerHTML = `
        <header class="post-header">
          <div class="post-author-box">
            <div class="post-author-avatar">${escapeHtml(authorInitial)}</div>
            <div class="post-author-info">
              <span class="post-author-email">${escapeHtml(post.email)}</span>
              <span class="post-time">${escapeHtml(timeAgo)}</span>
            </div>
          </div>
          <div class="post-header-actions">
            ${post.is_owner ? '<span class="owner-pill">You</span>' : ''}
            ${
              post.is_owner
                ? `<button class="btn-delete-post" title="Delete Post" data-id="${escapeHtml(post.id)}">🗑️</button>`
                : ''
            }
          </div>
        </header>

        <div class="post-media-wrap">
          ${
            isVideo
              ? `<video class="feed-video" controls playsinline preload="metadata" src="${escapeHtml(post.url)}"></video>`
              : `<img class="feed-img" loading="lazy" src="${escapeHtml(post.url)}" alt="${escapeHtml(post.caption || 'Photo')}" onerror="this.onerror=null;this.src='https://via.placeholder.com/800x600/131b2e/64748b?text=Media+Preview';" />`
          }
        </div>

        <div class="post-content-box">
          ${post.caption ? `<p class="post-caption">${escapeHtml(post.caption)}</p>` : ''}
          <div class="post-meta-footer">
            <span class="media-badge">
              ${isVideo ? '🎬 Video' : '📷 Photo'} &bull; ${escapeHtml(truncateString(post.file_name, 22))}
            </span>
            <a href="${escapeHtml(post.url)}" target="_blank" rel="noopener noreferrer" class="ik-cdn-link">
              View Media &rarr;
            </a>
          </div>
        </div>
      `;

      // Attach delete event
      if (post.is_owner) {
        const deleteBtn = card.querySelector('.btn-delete-post');
        if (deleteBtn) {
          deleteBtn.addEventListener('click', () => handleDeletePost(post.id));
        }
      }

      feedCards.appendChild(card);
    });
  }

  // --- Delete Post Action ---
  async function handleDeletePost(postId) {
    if (!confirm('Are you sure you want to delete this post? This cannot be undone.')) {
      return;
    }

    try {
      const res = await fetch(`/posts/${postId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Could not delete post');
      }

      showToast('Post deleted successfully', 'success');

      // Remove from cachedPosts & DOM
      cachedPosts = cachedPosts.filter((p) => p.id !== postId);
      applyFilterAndRender();
    } catch (err) {
      console.error('Delete Error:', err);
      showToast(err.message || 'Failed to delete post', 'error');
    }
  }

  // --- Helper Functions ---
  function formatBytes(bytes, decimals = 1) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  function formatTimeAgo(dateString) {
    if (!dateString) return 'Just now';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Recently';

    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;

    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function truncateString(str, num) {
    if (!str) return '';
    return str.length > num ? str.slice(0, num) + '...' : str;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function showToast(message, type = 'success') {
    toastMessage.textContent = message;
    toast.className = `toast toast-${type}`;
    toastIcon.textContent = type === 'success' ? '✓' : '⚠';
    toast.classList.remove('hidden');

    setTimeout(() => {
      toast.classList.add('hidden');
    }, 4500);
  }
});
