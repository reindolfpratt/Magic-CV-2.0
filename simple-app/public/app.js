// DOM Elements
const cvForm = document.getElementById('cvForm');
const jobDescription = document.getElementById('jobDescription');
const cvFile = document.getElementById('cvFile');
const uploadZone = document.getElementById('uploadZone');
const fileInfo = document.getElementById('fileInfo');
const fileName = document.getElementById('fileName');
const removeFile = document.getElementById('removeFile');
const submitBtn = document.getElementById('submitBtn');
const resultsSection = document.getElementById('resultsSection');
const resetBtn = document.getElementById('resetBtn');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toastMessage');

// New Elements
const formatBtns = document.querySelectorAll('.format-btn');
const generateCV = document.getElementById('generateCV');
const generateCoverLetter = document.getElementById('generateCoverLetter');
const generateEmail = document.getElementById('generateEmail');
const resultsGrid = document.getElementById('resultsGrid');
const cvCard = document.getElementById('cvCard');
const coverLetterCard = document.getElementById('coverLetterCard');
const emailCard = document.getElementById('emailCard');

// State
let results = null;
let selectedFormat = 'docx';

// Format Toggle Logic
formatBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        formatBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedFormat = btn.dataset.format;
    });
});

// Show toast notification
function showToast(message, isSuccess = false, duration = 5000) {
    toastMessage.textContent = message;
    toast.classList.toggle('success', isSuccess);
    toast.classList.add('active');
    setTimeout(() => toast.classList.remove('active'), duration);
}

// Toggle preview visibility
function togglePreview(type) {
    const id = 'preview' + type.charAt(0).toUpperCase() + type.slice(1);
    const preview = document.getElementById(id);
    if (preview) {
        preview.classList.toggle('active');
    }
}

// Properly convert base64 to binary and download
function downloadFile(base64Data, fileName, format) {
    try {
        if (!base64Data) {
            showToast('No file data available');
            return;
        }
        
        const binaryString = atob(base64Data);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        
        let mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        if (format === 'pdf') {
            mimeType = 'application/pdf';
        }
        
        const blob = new Blob([bytes], { type: mimeType });
        saveAs(blob, fileName);
        showToast(fileName + ' downloaded!', true, 3000);
        
    } catch (error) {
        console.error('Download error:', error);
        showToast('Download failed: ' + error.message);
    }
}

// Handle file selection
cvFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        fileName.textContent = file.name;
        fileInfo.classList.add('active');
    }
});

// Click on upload zone opens file picker
uploadZone.addEventListener('click', (e) => {
    if (e.target === removeFile || e.target === fileInfo || fileInfo.contains(e.target)) {
        return;
    }
    cvFile.click();
});

// Remove selected file
removeFile.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    cvFile.value = '';
    fileInfo.classList.remove('active');
});

// Drag and drop
uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.style.borderColor = '#3D2B1F';
});

uploadZone.addEventListener('dragleave', () => {
    uploadZone.style.borderColor = '';
});

uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.style.borderColor = '';
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        const file = files[0];
        if (file.type === 'application/pdf' || file.name.endsWith('.docx')) {
            const dt = new DataTransfer();
            dt.items.add(file);
            cvFile.files = dt.files;
            fileName.textContent = file.name;
            fileInfo.classList.add('active');
        } else {
            showToast('Please upload a PDF or DOCX file.');
        }
    }
});

// Reset form
resetBtn.addEventListener('click', () => {
    cvForm.reset();
    fileInfo.classList.remove('active');
    resultsSection.classList.remove('active');
    results = null;
    document.querySelectorAll('.preview-content').forEach(p => p.classList.remove('active'));
    window.scrollTo({ top: 0, behavior: 'smooth' });
});

// Form submission
cvForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (!jobDescription.value.trim()) {
        showToast('Please enter a job description.');
        jobDescription.focus();
        return;
    }
    
    if (!cvFile.files[0]) {
        showToast('Please upload your CV.');
        return;
    }

    const options = {
        cv: generateCV.checked,
        coverLetter: generateCoverLetter.checked,
        email: generateEmail.checked,
        format: selectedFormat
    };

    if (!options.cv && !options.coverLetter && !options.email) {
        showToast('Please select at least one document to generate.');
        return;
    }
    
    submitBtn.classList.add('loading');
    submitBtn.disabled = true;
    resultsSection.classList.remove('active');
    
    const formData = new FormData();
    formData.append('jobDescription', jobDescription.value.trim());
    formData.append('cv', cvFile.files[0]);
    formData.append('options', JSON.stringify(options));
    
    try {
        const response = await fetch('/api/tailor-cv', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to process CV');
        }
        
        results = data;
        
        // Update results UI visibility
        cvCard.style.display = options.cv ? 'block' : 'none';
        coverLetterCard.style.display = options.coverLetter ? 'block' : 'none';
        emailCard.style.display = options.email ? 'block' : 'none';

        // Update grid columns based on number of visible cards
        const visibleCount = [options.cv, options.coverLetter, options.email].filter(Boolean).length;
        resultsGrid.style.gridTemplateColumns = `repeat(${visibleCount}, 1fr)`;
        if (window.innerWidth <= 768) {
            resultsGrid.style.gridTemplateColumns = '1fr';
        }
        
        // Update previews
        if (data.cv) document.getElementById('previewCV').textContent = data.cv.preview;
        if (data.coverLetter) document.getElementById('previewCoverLetter').textContent = data.coverLetter.preview;
        if (data.email) document.getElementById('previewEmail').textContent = data.email.preview;
        
        // Show results
        resultsSection.classList.add('active');
        resultsSection.scrollIntoView({ behavior: 'smooth' });
        
        showToast('Documents generated successfully!', true);
        
    } catch (error) {
        console.error('Error:', error);
        showToast(error.message || 'Failed to process CV. Please try again.');
    } finally {
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
    }
});

// Download button handlers
document.getElementById('downloadCV').addEventListener('click', () => {
    if (results && results.cv) {
        downloadFile(results.cv.fileData, results.cv.fileName, selectedFormat);
    }
});

document.getElementById('downloadCoverLetter').addEventListener('click', () => {
    if (results && results.coverLetter) {
        downloadFile(results.coverLetter.fileData, results.coverLetter.fileName, selectedFormat);
    }
});

document.getElementById('downloadEmail').addEventListener('click', () => {
    if (results && results.email) {
        downloadFile(results.email.fileData, results.email.fileName, selectedFormat);
    }
});

// Health check
fetch('/api/health')
    .then(r => r.json())
    .then(d => console.log('API Health:', d))
    .catch(e => console.warn('API not available:', e));

// Update year automatically
document.getElementById('currentYear').textContent = new Date().getFullYear();

window.togglePreview = togglePreview;
