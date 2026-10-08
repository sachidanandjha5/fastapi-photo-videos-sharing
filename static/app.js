// ShareCare - Secure Cloud Media & File Drive

document.addEventListener('DOMContentLoaded', () => {
  // State
  let token = localStorage.getItem('token') || null;
  let user = null;
  try {
    user = JSON.parse(localStorage.getItem('user') || 'null');
  } catch (e) {
    user = null;
  }
  let cachedPosts = [];
  let cachedStats = null;
  let selectedFile = null;
  let authMode = 'login'; // 'login' | 'signup'

  // Workspace View & Filter State
  let viewMode = localStorage.getItem('sharecare_view_mode') || 'grid'; // 'grid' | 'list'
  let activeCategory = 'all';
  let searchQuery = '';
  let sortMode = 'newest';

  // DOM Elements - Nav & Auth
  const navGuest = document.getElementById('nav-guest');
  const navUser = document.getElementById('nav-user');
  const navLoginBtn = document.getElementById('nav-login-btn');
  const navSignupBtn = document.getElementById('nav-signup-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const userAvatar = document.getElementById('user-avatar');
  const userEmailDisplay = document.getElementById('user-email-display');
  const navStoragePill = document.getElementById('nav-storage-pill');
  const navStorageText = document.getElementById('nav-storage-text');

  // DOM Elements - Panels
  const uploadPanel = document.getElementById('upload-panel');
  const guestPanel = document.getElementById('guest-panel');
  const guestLoginBtn = document.getElementById('guest-login-btn');
  const guestSignupBtn = document.getElementById('guest-signup-btn');

  // DOM Elements - Upload Studio
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

  // DOM Elements - Progress Bar
  const uploadProgressContainer = document.getElementById('upload-progress-container');
  const progressStatus = document.getElementById('progress-status');
  const progressPercent = document.getElementById('progress-percent');
  const progressBarFill = document.getElementById('progress-bar-fill');
  const progressBytes = document.getElementById('progress-bytes');

  // DOM Elements - Drive Feed & Toolbar
  const driveToolbar = document.getElementById('drive-toolbar');
  const searchInput = document.getElementById('search-input');
  const searchClearBtn = document.getElementById('search-clear-btn');
  const catPills = document.querySelectorAll('.cat-pill');
  const sortSelect = document.getElementById('sort-select');
  const viewGridBtn = document.getElementById('view-grid-btn');
  const viewListBtn = document.getElementById('view-list-btn');

  const feedCards = document.getElementById('feed-cards');
  const emptyFeed = document.getElementById('empty-feed');
  const feedLoader = document.getElementById('feed-loader');
  const postsCounter = document.getElementById('posts-counter');
  const refreshFeedBtn = document.getElementById('refresh-feed-btn');

  // DOM Elements - Modals
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

  // DOM Elements - Lightbox Media Viewer
  const lightboxModal = document.getElementById('lightbox-modal');
  const lightboxCloseBtn = document.getElementById('lightbox-close-btn');
  const lightboxContent = document.getElementById('lightbox-content');
  const lightboxTitle = document.getElementById('lightbox-title');
  const lightboxSub = document.getElementById('lightbox-sub');
  const lightboxDownloadLink = document.getElementById('lightbox-download-link');

  // DOM Elements - Toast
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
    applyViewMode(viewMode);

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
    if (!container || !googleClientId) return;

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

      const userRes = await fetch('/users/me', { headers: getAuthHeaders() });
      if (userRes.ok) {
        user = await userRes.json();
        localStorage.setItem('user', JSON.stringify(user));
      }

      closeAuthModal();
      updateAuthUI();
      showToast(`Welcome to ShareCare, ${user ? user.email : 'User'}!`, 'success');
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
      showToast(`Welcome to ShareCare, ${user ? user.email : email}!`, 'success');
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
      if (driveToolbar) driveToolbar.classList.remove('hidden');

      userEmailDisplay.textContent = user.email;
      userAvatar.textContent = (user.email[0] || 'U').toUpperCase();

      if (cachedStats && navStorageText) {
        navStorageText.textContent = `${formatBytes(cachedStats.total_size || 0)} used`;
      }
    } else {
      navUser.classList.add('hidden');
      navGuest.classList.remove('hidden');
      uploadPanel.classList.add('hidden');
      guestPanel.classList.remove('hidden');
      if (driveToolbar) driveToolbar.classList.add('hidden');
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
        const regRes = await fetch('/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });

        if (!regRes.ok) {
          const errData = await regRes.json().catch(() => ({}));
          let msg = errData.detail || 'Registration failed';
          if (msg === 'REGISTER_USER_ALREADY_EXISTS') {
            msg = 'This email is already registered! Please sign in.';
          } else if (msg === 'REGISTER_INVALID_PASSWORD') {
            msg = 'Password must be at least 6 characters.';
          }
          throw new Error(msg);
        }
        showToast('Account created successfully! Signing in...', 'success');
      }

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
          msg = 'Incorrect email or password.';
        }
        throw new Error(msg);
      }

      const tokenData = await loginRes.json();
      token = tokenData.access_token;
      localStorage.setItem('token', token);

      const userRes = await fetch('/users/me', { headers: getAuthHeaders() });
      if (userRes.ok) {
        user = await userRes.json();
        localStorage.setItem('user', JSON.stringify(user));
      }

      closeAuthModal();
      updateAuthUI();
      showToast(`Welcome to ShareCare, ${user ? user.email : 'User'}!`, 'success');
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
    cachedPosts = [];
    cachedStats = null;
    if (feedCards) feedCards.innerHTML = '';
    if (postsCounter) postsCounter.textContent = '0 files';
    if (navStorageText) navStorageText.textContent = '0 MB used';
    updateAuthUI();
    if (emptyFeed) {
      emptyFeed.classList.remove('hidden');
      const h3 = emptyFeed.querySelector('h3');
      const p = emptyFeed.querySelector('p');
      if (h3) h3.textContent = 'Sign in to access your files';
      if (p) p.textContent = 'Sign in with your Google account to view and upload files.';
    }
    if (showNotification) {
      showToast('You have been signed out from ShareCare.', 'success');
    }
  }

  // --- Dropzone & File Selection ---
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
      previewMediaContainer.innerHTML = '<span style="font-size:2.8rem;">🎵</span>';
    } else {
      previewMediaContainer.innerHTML = '<span style="font-size:2.8rem;">📄</span>';
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

  // --- High-Capacity Direct Upload Form Submission ---
  uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!selectedFile) {
      showToast('Please choose a file to upload.', 'error');
      return;
    }

    if (!token) {
      openAuthModal('login');
      return;
    }

    // Limit check: up to 100 MB supported!
    if (selectedFile.size > 105 * 1024 * 1024) {
      showToast('File exceeds 100 MB. Please choose a file up to 100 MB.', 'error');
      return;
    }

    submitPostBtn.disabled = true;
    uploadSpinner.classList.remove('hidden');
    uploadBtnText.textContent = 'Preparing upload...';
    uploadProgressContainer.classList.remove('hidden');
    progressBarFill.style.width = '0%';
    progressPercent.textContent = '0%';
    progressStatus.textContent = 'Connecting to cloud...';
    progressBytes.textContent = `0 MB / ${formatBytes(selectedFile.size)}`;

    const caption = document.getElementById('post-caption').value.trim();

    try {
      // Step 1: Request client-side upload authorization credentials
      let authData = null;
      try {
        const authRes = await fetch('/upload/auth', { headers: getAuthHeaders() });
        if (authRes.ok) {
          authData = await authRes.json();
        }
      } catch (authErr) {
        console.warn('Could not retrieve upload auth credentials, trying direct fallback:', authErr);
      }

      if (authData && authData.signature && authData.public_key) {
        // Step 2A: Direct-to-CDN Streaming Upload (Bypasses Vercel 4.5 MB Limit)
        progressStatus.textContent = 'Uploading directly to CDN...';
        const ikResult = await uploadDirectToImageKit(selectedFile, authData);

        // Step 3: Register uploaded file metadata in user's database
        progressStatus.textContent = 'Saving file to your drive...';
        const recordRes = await fetch('/files/record', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
          },
          body: JSON.stringify({
            url: ikResult.url,
            file_name: ikResult.name || selectedFile.name,
            file_type: ikResult.fileType || detectFileType(selectedFile),
            imagekit_file_id: ikResult.fileId || null,
            file_size: ikResult.size || selectedFile.size,
            caption: caption,
          }),
        });

        if (!recordRes.ok) {
          throw new Error('Failed to save file record in database.');
        }
      } else {
        // Step 2B: Fallback to server endpoint (for smaller files / offline dev)
        progressStatus.textContent = 'Uploading via server proxy...';
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('caption', caption);

        const res = await fetch('/upload', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: formData,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || 'Upload failed');
        }
      }

      progressBarFill.style.width = '100%';
      progressPercent.textContent = '100%';
      progressStatus.textContent = 'Upload complete!';
      showToast('File uploaded successfully to your ShareCare drive!', 'success');

      uploadForm.reset();
      clearSelectedFile();

      // Refresh drive files
      await loadFeed();
    } catch (err) {
      console.error('Upload Error:', err);
      showToast(err.message || 'Upload failed', 'error');
    } finally {
      setTimeout(() => {
        uploadProgressContainer.classList.add('hidden');
        submitPostBtn.disabled = false;
        uploadSpinner.classList.add('hidden');
        uploadBtnText.textContent = 'Upload to ShareCare';
      }, 1000);
    }
  });

  // Direct XMLHttpRequest to ImageKit CDN with real-time percentage
  function uploadDirectToImageKit(file, auth) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();

      formData.append('file', file);
      formData.append('fileName', file.name || 'upload');
      formData.append('publicKey', auth.public_key);
      formData.append('signature', auth.signature);
      formData.append('expire', auth.expire);
      formData.append('token', auth.token);
      formData.append('folder', auth.folder);
      if (auth.tags && auth.tags.length > 0) {
        formData.append('tags', auth.tags.join(','));
      }
      formData.append('useUniqueFileName', 'true');

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percent = Math.min(99, Math.round((e.loaded / e.total) * 100));
          progressBarFill.style.width = `${percent}%`;
          progressPercent.textContent = `${percent}%`;
          progressStatus.textContent = `Streaming ${formatBytes(e.loaded)} / ${formatBytes(e.total)}...`;
          progressBytes.textContent = `${formatBytes(e.loaded)} of ${formatBytes(e.total)}`;
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            resolve(data);
          } catch (e) {
            reject(new Error('Invalid response from storage CDN.'));
          }
        } else {
          try {
            const errData = JSON.parse(xhr.responseText);
            reject(new Error(errData.message || 'Direct CDN upload error.'));
          } catch (e) {
            reject(new Error(`Storage error (Status ${xhr.status})`));
          }
        }
      };

      xhr.onerror = () => reject(new Error('Network error connecting to storage CDN.'));
      xhr.open('POST', 'https://upload.imagekit.io/api/v1/files/upload', true);
      xhr.send(formData);
    });
  }

  function detectFileType(file) {
    if (!file) return 'document';
    const type = file.type || '';
    if (type.startsWith('image/')) return 'image';
    if (type.startsWith('video/')) return 'video';
    if (type.startsWith('audio/')) return 'audio';
    return 'document';
  }

  // --- Drive Files Loading, Search & Category Filters ---
  refreshFeedBtn.addEventListener('click', () => {
    const icon = refreshFeedBtn.querySelector('.refresh-icon');
    if (icon) icon.style.transform = 'rotate(360deg)';
    loadFeed().then(() => {
      setTimeout(() => {
        if (icon) icon.style.transform = '';
      }, 500);
    });
  });

  // Search input listeners
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.trim().toLowerCase();
      if (searchClearBtn) {
        searchClearBtn.classList.toggle('hidden', searchQuery.length === 0);
      }
      applyFilterAndRender();
    });
  }

  if (searchClearBtn) {
    searchClearBtn.addEventListener('click', () => {
      searchInput.value = '';
      searchQuery = '';
      searchClearBtn.classList.add('hidden');
      applyFilterAndRender();
      searchInput.focus();
    });
  }

  // Category filter pills
  catPills.forEach((btn) => {
    btn.addEventListener('click', () => {
      catPills.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      activeCategory = btn.dataset.category || 'all';
      applyFilterAndRender();
    });
  });

  // Sort selector
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      sortMode = e.target.value;
      applyFilterAndRender();
    });
  }

  // View mode switcher (Grid vs List)
  if (viewGridBtn && viewListBtn) {
    viewGridBtn.addEventListener('click', () => applyViewMode('grid'));
    viewListBtn.addEventListener('click', () => applyViewMode('list'));
  }

  function applyViewMode(mode) {
    viewMode = mode;
    localStorage.setItem('sharecare_view_mode', mode);

    if (mode === 'grid') {
      if (viewGridBtn) viewGridBtn.classList.add('active');
      if (viewListBtn) viewListBtn.classList.remove('active');
      if (feedCards) {
        feedCards.classList.add('grid-view');
        feedCards.classList.remove('list-view');
      }
    } else {
      if (viewListBtn) viewListBtn.classList.add('active');
      if (viewGridBtn) viewGridBtn.classList.remove('active');
      if (feedCards) {
        feedCards.classList.add('list-view');
        feedCards.classList.remove('grid-view');
      }
    }
    applyFilterAndRender();
  }

  async function loadFeed() {
    feedLoader.classList.remove('hidden');
    emptyFeed.classList.add('hidden');

    try {
      if (!token) {
        cachedPosts = [];
        cachedStats = null;
        feedLoader.classList.add('hidden');
        renderPosts([]);
        return;
      }

      const res = await fetch('/files', { headers: getAuthHeaders() });
      if (!res.ok) {
        if (res.status === 401) {
          handleLogout(false);
          cachedPosts = [];
          renderPosts([]);
          return;
        }
        throw new Error('Failed to load files');
      }

      const data = await res.json();
      cachedPosts = data.files || data.posts || [];
      cachedStats = data.stats || null;

      // Update storage pill in navbar
      if (cachedStats && navStorageText) {
        navStorageText.textContent = `${formatBytes(cachedStats.total_size || 0)} used`;
      }

      applyFilterAndRender();
    } catch (err) {
      console.error('Feed error:', err);
      showToast('Could not load files: ' + err.message, 'error');
    } finally {
      feedLoader.classList.add('hidden');
    }
  }

  function applyFilterAndRender() {
    let filtered = [...cachedPosts];

    // 1. Filter by category
    if (activeCategory !== 'all') {
      filtered = filtered.filter((p) => p.file_type === activeCategory);
    }

    // 2. Filter by search query
    if (searchQuery) {
      filtered = filtered.filter((p) => {
        const nameMatch = (p.file_name || '').toLowerCase().includes(searchQuery);
        const captionMatch = (p.caption || '').toLowerCase().includes(searchQuery);
        return nameMatch || captionMatch;
      });
    }

    // 3. Sort files
    if (sortMode === 'newest') {
      filtered.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    } else if (sortMode === 'oldest') {
      filtered.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
    } else if (sortMode === 'name_asc') {
      filtered.sort((a, b) => (a.file_name || '').localeCompare(b.file_name || ''));
    } else if (sortMode === 'size_desc') {
      filtered.sort((a, b) => (b.file_size || 0) - (a.file_size || 0));
    }

    // Update counter
    postsCounter.textContent = `${filtered.length} file${filtered.length === 1 ? '' : 's'}`;

    renderPosts(filtered);
  }

  function renderPosts(posts) {
    feedCards.innerHTML = '';

    if (!token) {
      emptyFeed.classList.remove('hidden');
      emptyFeed.querySelector('h3').textContent = 'Sign in to access your files';
      emptyFeed.querySelector('p').textContent = 'Sign in with your Google account to view and upload files.';
      postsCounter.textContent = '0 files';
      return;
    }

    if (posts.length === 0) {
      emptyFeed.classList.remove('hidden');
      if (searchQuery || activeCategory !== 'all') {
        emptyFeed.querySelector('h3').textContent = 'No matching files found';
        emptyFeed.querySelector('p').textContent = 'Try adjusting your search terms or category filters.';
      } else {
        emptyFeed.querySelector('h3').textContent = 'No files uploaded yet';
        emptyFeed.querySelector('p').textContent = 'Upload photos, videos, PDFs, or documents using the panel on the left.';
      }
      return;
    }

    emptyFeed.classList.add('hidden');

    if (viewMode === 'grid') {
      renderGridView(posts);
    } else {
      renderListView(posts);
    }
  }

  // --- Grid View Rendering ---
  function renderGridView(posts) {
    posts.forEach((post) => {
      const card = document.createElement('article');
      card.className = 'post-card';
      card.id = `post-${post.id}`;

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
          <div class="audio-post-box">
            <div class="audio-icon">🎵</div>
            <audio controls style="width:100%;max-width:280px;" src="${escapeHtml(post.url)}"></audio>
          </div>
        `;
      } else if (isDocument) {
        badgeLabel = '📄 Doc';
        mediaHtml = `
          <div class="doc-post-box">
            <div class="doc-icon">📄</div>
            <div style="font-size:0.8rem;color:var(--text-muted);font-weight:600;">Document File</div>
          </div>
        `;
      } else {
        badgeLabel = '📷 Photo';
        mediaHtml = `<img class="feed-img" loading="lazy" src="${escapeHtml(post.url)}" alt="${escapeHtml(post.caption || post.file_name)}" />`;
      }

      card.innerHTML = `
        <div class="post-media-wrap" data-file-id="${escapeHtml(post.id)}">
          ${mediaHtml}
        </div>

        <div class="post-body">
          <div class="post-title-row">
            <span class="post-filename" title="${escapeHtml(post.file_name)}">${escapeHtml(post.file_name || 'File')}</span>
            <span class="media-tag">${badgeLabel}</span>
          </div>

          ${post.caption ? `<p class="post-caption-text">${escapeHtml(post.caption)}</p>` : ''}

          <div class="post-meta-row">
            <span>${escapeHtml(formatBytes(post.file_size || 0))}</span>
            <span>${escapeHtml(timeAgo)}</span>
          </div>

          <div class="post-actions-row">
            <a href="${escapeHtml(post.url)}" target="_blank" rel="noopener noreferrer" class="btn-open-file" title="Download or open file">
              📥 Open / Download
            </a>
            <button type="button" class="btn-delete-post" title="Delete File" data-id="${escapeHtml(post.id)}">
              🗑️
            </button>
          </div>
        </div>
      `;

      // Open Lightbox on media click
      const mediaWrap = card.querySelector('.post-media-wrap');
      if (mediaWrap && !isAudio && !isVideo) {
        mediaWrap.addEventListener('click', () => openLightbox(post));
      }

      // Attach delete event
      const deleteBtn = card.querySelector('.btn-delete-post');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          handleDeletePost(post.id);
        });
      }

      feedCards.appendChild(card);
    });
  }

  // --- List View Rendering ---
  function renderListView(posts) {
    posts.forEach((post) => {
      const row = document.createElement('div');
      row.className = 'list-item-row';
      row.id = `post-${post.id}`;

      const timeAgo = formatTimeAgo(post.created_at);
      const isImage = post.file_type === 'image';
      const isVideo = post.file_type === 'video';
      const isAudio = post.file_type === 'audio';

      let iconHtml = '📄';
      if (isImage) {
        iconHtml = `<img src="${escapeHtml(post.url)}" alt="${escapeHtml(post.file_name)}" />`;
      } else if (isVideo) {
        iconHtml = '🎬';
      } else if (isAudio) {
        iconHtml = '🎵';
      }

      row.innerHTML = `
        <div class="list-thumb">${iconHtml}</div>
        <div class="list-name-col">
          <div class="list-filename" title="${escapeHtml(post.file_name)}">${escapeHtml(post.file_name || 'File')}</div>
          ${post.caption ? `<div class="list-caption">${escapeHtml(post.caption)}</div>` : ''}
        </div>
        <div class="list-type-col">
          <span class="media-tag">${post.file_type.toUpperCase()}</span>
        </div>
        <div class="list-size-col">${escapeHtml(formatBytes(post.file_size || 0))}</div>
        <div class="list-date-col">${escapeHtml(timeAgo)}</div>
        <div class="list-actions-col">
          <a href="${escapeHtml(post.url)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary-sm" title="Download">
            📥
          </a>
          <button type="button" class="btn-delete-post" title="Delete File" data-id="${escapeHtml(post.id)}">
            🗑️
          </button>
        </div>
      `;

      // Open Lightbox on click for images and videos
      if (isImage || isVideo) {
        const thumb = row.querySelector('.list-thumb');
        if (thumb) {
          thumb.style.cursor = 'pointer';
          thumb.addEventListener('click', () => openLightbox(post));
        }
      }

      // Attach delete event
      const deleteBtn = row.querySelector('.btn-delete-post');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          handleDeletePost(post.id);
        });
      }

      feedCards.appendChild(row);
    });
  }

  // --- Lightbox Media Viewer Modal ---
  function openLightbox(post) {
    if (!lightboxModal) return;
    lightboxContent.innerHTML = '';

    if (post.file_type === 'image') {
      const img = document.createElement('img');
      img.src = post.url;
      img.alt = post.file_name || 'Preview';
      lightboxContent.appendChild(img);
    } else if (post.file_type === 'video') {
      const video = document.createElement('video');
      video.src = post.url;
      video.controls = true;
      video.autoplay = true;
      video.playsInline = true;
      lightboxContent.appendChild(video);
    } else {
      lightboxContent.innerHTML = `
        <div style="text-align:center;padding:2rem;">
          <div style="font-size:4rem;margin-bottom:1rem;">📄</div>
          <div style="font-weight:600;font-size:1.1rem;color:#fff;">${escapeHtml(post.file_name)}</div>
        </div>
      `;
    }

    lightboxTitle.textContent = post.file_name || 'File';
    lightboxSub.textContent = `${post.file_type.toUpperCase()} • ${formatBytes(post.file_size || 0)} • ${formatTimeAgo(post.created_at)}`;
    lightboxDownloadLink.href = post.url;
    lightboxDownloadLink.download = post.file_name || 'file';

    lightboxModal.classList.remove('hidden');
  }

  function closeLightbox() {
    if (lightboxModal) {
      lightboxModal.classList.add('hidden');
      lightboxContent.innerHTML = '';
    }
  }

  if (lightboxCloseBtn) {
    lightboxCloseBtn.addEventListener('click', closeLightbox);
  }

  if (lightboxModal) {
    lightboxModal.addEventListener('click', (e) => {
      if (e.target === lightboxModal) closeLightbox();
    });
  }

  // --- Delete File Action ---
  async function handleDeletePost(postId) {
    if (!confirm('Are you sure you want to delete this file from your drive? This cannot be undone.')) {
      return;
    }

    try {
      const res = await fetch(`/files/${postId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Could not delete file');
      }

      showToast('File deleted successfully', 'success');

      // Remove from cachedPosts & refresh
      cachedPosts = cachedPosts.filter((p) => p.id !== postId);
      applyFilterAndRender();

      // Refresh storage metrics in background
      fetch('/files', { headers: getAuthHeaders() })
        .then((r) => r.json())
        .then((data) => {
          if (data.stats && navStorageText) {
            navStorageText.textContent = `${formatBytes(data.stats.total_size || 0)} used`;
          }
        })
        .catch(() => {});
    } catch (err) {
      console.error('Delete Error:', err);
      showToast(err.message || 'Failed to delete file', 'error');
    }
  }

  // --- Helper Functions ---
  function formatBytes(bytes, decimals = 1) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
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

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
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
