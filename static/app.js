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

  // Google OAuth State
  let googleClientId = null;

  // Initialize UI & Auth
  init();

  async function init() {
    updateAuthUI();
    initGoogleAuth();

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

  async function initGoogleAuth() {
    try {
      const res = await fetch('/auth/google/client-id');
      if (res.ok) {
        const data = await res.json();
        googleClientId = data.client_id;
        renderGoogleButton();
      }
    } catch (e) {
      console.warn('Could not fetch Google Client ID:', e);
    }
  }

  function renderGoogleButton() {
    const container = document.getElementById('google-btn-container');
    const notice = document.getElementById('google-notice');
    if (!container) return;

    if (!googleClientId) {
      if (notice) {
        notice.textContent = '💡 To enable one-click Google Sign-In, set GOOGLE_CLIENT_ID in your environment variables.';
        notice.classList.remove('hidden');
      }
      return;
    }

    if (notice) notice.classList.add('hidden');

    if (window.google && window.google.accounts && window.google.accounts.id) {
      try {
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: handleGoogleResponse,
        });

        window.google.accounts.id.renderButton(container, {
          theme: 'filled_black',
          size: 'large',
          shape: 'pill',
          width: 320,
          text: 'continue_with',
        });
      } catch (err) {
        console.error('Google button render error:', err);
      }
    } else {
      setTimeout(renderGoogleButton, 500);
    }
  }

  async function handleGoogleResponse(response) {
    if (!response || !response.credential) {
      showToast('Google Sign-In failed: no credential received', 'error');
      return;
    }

    try {
      showToast('Signing in with Google...', 'success');
      const res = await fetch('/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Google authentication failed');
      }

      const tokenData = await res.json();
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
      showToast(`Welcome, ${user ? user.email : 'Google User'}!`, 'success');
      loadFeed();
    } catch (err) {
      console.error('Google Auth Error:', err);
      showToast(err.message || 'Google Sign-In error', 'error');
    }
  }

  // --- Direct Google Sign-In & Account Picker ---
  const googleDirectBtn = document.getElementById('google-direct-btn');
  const googlePickerModal = document.getElementById('google-picker-modal');
  const googlePickerClose = document.getElementById('google-picker-close');
  const googleManualForm = document.getElementById('google-manual-form');
  const googleManualEmail = document.getElementById('google-manual-email');
  const googleRememberedSection = document.getElementById('google-remembered-section');
  const googleRememberedBtn = document.getElementById('google-remembered-btn');
  const googleRememberedEmail = document.getElementById('google-remembered-email');
  const googleRememberedAvatar = document.getElementById('google-remembered-avatar');

  function openGooglePicker() {
    closeAuthModal();
    if (!googlePickerModal) return;

    // Check if this specific device has a remembered account
    const savedEmail = localStorage.getItem('last_google_email');
    if (savedEmail && googleRememberedSection && googleRememberedEmail && googleRememberedAvatar) {
      googleRememberedEmail.textContent = savedEmail;
      googleRememberedAvatar.textContent = (savedEmail[0] || 'U').toUpperCase();
      googleRememberedSection.classList.remove('hidden');
    } else if (googleRememberedSection) {
      googleRememberedSection.classList.add('hidden');
    }

    if (googleManualEmail) googleManualEmail.value = '';
    googlePickerModal.classList.remove('hidden');
    if (googleManualEmail) googleManualEmail.focus();
  }

  if (googleDirectBtn) {
    googleDirectBtn.addEventListener('click', openGooglePicker);
  }

  if (googlePickerClose) {
    googlePickerClose.addEventListener('click', () => {
      if (googlePickerModal) googlePickerModal.classList.add('hidden');
    });
  }

  if (googlePickerModal) {
    googlePickerModal.addEventListener('click', (e) => {
      if (e.target === googlePickerModal) googlePickerModal.classList.add('hidden');
    });
  }

  if (googleRememberedBtn) {
    googleRememberedBtn.addEventListener('click', () => {
      const savedEmail = localStorage.getItem('last_google_email');
      if (savedEmail) directGoogleLogin(savedEmail);
    });
  }

  if (googleManualForm) {
    googleManualForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = googleManualEmail.value.trim();
      if (email) directGoogleLogin(email);
    });
  }

  async function directGoogleLogin(email) {
    try {
      showToast('Signing in with Google account...', 'success');
      const res = await fetch('/auth/google/direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Google sign-in failed');
      }

      const tokenData = await res.json();
      token = tokenData.access_token;
      localStorage.setItem('token', token);
      localStorage.setItem('last_google_email', email);

      const userRes = await fetch('/users/me', { headers: getAuthHeaders() });
      if (userRes.ok) {
        user = await userRes.json();
        localStorage.setItem('user', JSON.stringify(user));
      }

      if (googlePickerModal) googlePickerModal.classList.add('hidden');
      closeAuthModal();
      updateAuthUI();
      showToast(`Welcome, ${user ? user.email : email}!`, 'success');
      loadFeed();
    } catch (err) {
      console.error('Direct Google Auth Error:', err);
      showToast(err.message || 'Google sign-in failed', 'error');
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
    } else if (file.type.startsWith('audio/')) {
      previewMediaContainer.innerHTML = '<span style="font-size:2.5rem;">🎵</span>';
    } else {
      previewMediaContainer.innerHTML = '<span style="font-size:2.5rem;">📄</span>';
    }

    dropzoneIdle.classList.add('hidden');
    previewBox.classList.remove('hidden');
  }

  function compressImageIfLarge(file) {
    return new Promise((resolve) => {
      // Only compress images larger than 1.8 MB
      if (!file.type.startsWith('image/') || file.size <= 1.8 * 1024 * 1024) {
        resolve(file);
        return;
      }

      const img = new Image();
      const reader = new FileReader();
      reader.onload = (e) => {
        img.onload = () => {
          const maxDim = 1920;
          let width = img.width;
          let height = img.height;

          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (blob && blob.size < file.size) {
                const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, '.jpg'), {
                  type: 'image/jpeg',
                  lastModified: Date.now(),
                });
                resolve(compressedFile);
              } else {
                resolve(file);
              }
            },
            'image/jpeg',
            0.82
          );
        };
        img.onerror = () => resolve(file);
        img.src = e.target.result;
      };
      reader.onerror = () => resolve(file);
      reader.readAsDataURL(file);
    });
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
      showToast('Please select a file to upload.', 'error');
      return;
    }

    if (!token) {
      openAuthModal('login');
      return;
    }

    submitPostBtn.disabled = true;
    uploadSpinner.classList.remove('hidden');
    uploadBtnText.textContent = 'Preparing upload...';

    try {
      let fileToUpload = selectedFile;
      if (selectedFile.type.startsWith('image/')) {
        uploadBtnText.textContent = 'Optimizing image...';
        fileToUpload = await compressImageIfLarge(selectedFile);
      }

      if (fileToUpload.size > 4.5 * 1024 * 1024) {
        throw new Error('File exceeds the 4.5 MB serverless limit. Please choose a smaller file.');
      }

      const caption = document.getElementById('post-caption').value.trim();
      const formData = new FormData();
      formData.append('file', fileToUpload);
      formData.append('caption', caption);

      uploadBtnText.textContent = 'Uploading to cloud...';

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
      const isAudio = post.file_type === 'audio';
      const isDocument = post.file_type === 'document';

      let mediaHtml = '';
      let badgeLabel = '📷 Photo';

      if (isVideo) {
        badgeLabel = '🎬 Video';
        mediaHtml = `<video class="feed-video" controls playsinline preload="metadata" src="${escapeHtml(post.url)}"></video>`;
      } else if (isAudio) {
        badgeLabel = '🎵 Audio';
        mediaHtml = `
          <div class="audio-post-box" style="padding:2.5rem 1.5rem;text-align:center;background:rgba(255,255,255,0.03);">
            <div style="font-size:2.5rem;margin-bottom:0.75rem;">🎵</div>
            <audio controls style="width:100%;max-width:320px;" src="${escapeHtml(post.url)}"></audio>
          </div>
        `;
      } else if (isDocument) {
        badgeLabel = '📄 Document';
        mediaHtml = `
          <div class="doc-post-box" style="padding:2.5rem 1.5rem;text-align:center;background:rgba(255,255,255,0.03);">
            <div style="font-size:3rem;margin-bottom:0.6rem;">📄</div>
            <div style="font-weight:600;font-size:0.95rem;color:var(--text-primary);margin-bottom:0.85rem;word-break:break-all;">
              ${escapeHtml(post.file_name || 'Document File')}
            </div>
            <a href="${escapeHtml(post.url)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary" style="display:inline-flex;padding:0.45rem 1.15rem;font-size:0.85rem;border-radius:2rem;">
              📥 View / Download
            </a>
          </div>
        `;
      } else {
        badgeLabel = '📷 Photo';
        mediaHtml = `<img class="feed-img" loading="lazy" src="${escapeHtml(post.url)}" alt="${escapeHtml(post.caption || 'Photo')}" onerror="this.onerror=null;this.src='https://via.placeholder.com/800x600/131b2e/64748b?text=Media+Preview';" />`;
      }

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
          ${mediaHtml}
        </div>

        <div class="post-content-box">
          ${post.caption ? `<p class="post-caption">${escapeHtml(post.caption)}</p>` : ''}
          <div class="post-meta-footer">
            <span class="media-badge">
              ${badgeLabel} &bull; ${escapeHtml(truncateString(post.file_name, 22))}
            </span>
            <a href="${escapeHtml(post.url)}" target="_blank" rel="noopener noreferrer" class="ik-cdn-link">
              View File &rarr;
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
