const dropzone = document.getElementById('dropzone');
const folderInput = document.getElementById('folder-input');
const zipInput = document.getElementById('zip-input');
const status = document.getElementById('status');
const notFollowingBack = document.getElementById('not-following-back');
const notFollowedBack = document.getElementById('not-followed-back');
const results = document.getElementById('results');

const modalOverlay = document.getElementById('modal-overlay');
const folderOption = document.getElementById('folder-option');
const zipOption = document.getElementById('zip-option');
const cancelButton = document.getElementById('cancel-button');

// Drag and Drop Handlers
dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
});

dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
});

dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    handleDrop(e.dataTransfer);
});

// Click Handler to Open Selection Modal
dropzone.addEventListener('click', () => {
    showModal();
});

// Modal Button Event Listeners
folderOption.addEventListener('click', () => {
    hideModal();
    folderInput.click();
});

zipOption.addEventListener('click', () => {
    hideModal();
    zipInput.click();
});

cancelButton.addEventListener('click', () => {
    hideModal();
});

// Folder Input Change Handler
folderInput.addEventListener('change', (e) => {
    handleFiles(e.target.files);
});

// Zip Input Change Handler
zipInput.addEventListener('change', (e) => {
    handleZipFile(e.target.files[0]);
});

function handleDrop(dataTransfer) {
    resetResults();

    const items = dataTransfer.items;
    if (items.length === 0) {
        showError('No files detected. Please select the correct folder or ZIP file.');
        return;
    }

    // Check if the dropped item is a ZIP file
    if (dataTransfer.files.length === 1 && dataTransfer.files[0].name.endsWith('.zip')) {
        handleZipFile(dataTransfer.files[0]);
    } else if (items[0].webkitGetAsEntry) {
        // Handle folder or file drop
        handleFiles(items);
    } else {
        showError('Unsupported file type. Please upload a folder or ZIP file.');
    }
}

function handleZipFile(file) {
    const formData = new FormData();
    formData.append('zipfile', file);

    fetch('/upload-folder', {
        method: 'POST',
        body: formData,
    })
    .then(response => response.json())
    .then(handleResponse)
    .catch(handleError);
}

function handleFiles(items) {
    const formData = new FormData();
    let promises = [];

    if (items[0].webkitGetAsEntry) {
        // Handling drag and drop
        for (let i = 0; i < items.length; i++) {
            let item = items[i].webkitGetAsEntry();
            if (item) {
                promises.push(traverseFileTree(item));
            }
        }
    } else if (items.length > 0 && items[0].webkitRelativePath) {
        // Handling folder selection via input
        for (let i = 0; i < items.length; i++) {
            let file = items[i];
            let relativePath = file.webkitRelativePath || file.name;
            formData.append('folder', file, relativePath);
        }
    } else {
        showError('Folder upload is not supported in your browser. Please use a ZIP file instead.');
        return;
    }

    Promise.all(promises).then(() => {
        fetch('/upload-folder', {
            method: 'POST',
            body: formData,
        })
        .then(response => response.json())
        .then(handleResponse)
        .catch(handleError);
    }).catch(handleError);

    function traverseFileTree(item, path = '') {
        return new Promise((resolve, reject) => {
            if (item.isFile) {
                item.file(function(file) {
                    formData.append('folder', file, path + file.name);
                    resolve();
                }, reject);
            } else if (item.isDirectory) {
                var dirReader = item.createReader();
                dirReader.readEntries(function(entries) {
                    let promises = [];
                    for (let i = 0; i < entries.length; i++) {
                        promises.push(traverseFileTree(entries[i], path + item.name + '/'));
                    }
                    Promise.all(promises).then(resolve).catch(reject);
                }, reject);
            }
        });
    }
}

function handleResponse(data) {
    if (data.error) {
        showError(`Error: ${data.error}`);
    } else {
        status.textContent = data.status;
        status.classList.remove('error');
        status.classList.add('success');

        // Clear previous results
        notFollowingBack.innerHTML = '';
        notFollowedBack.innerHTML = '';

        // Update heading with the counts
        const notFollowingBackCount = data.not_following_back.length;
        const notFollowedBackCount = data.not_followed_back.length;

        document.querySelector('h3:nth-of-type(2)').textContent = `Not Following Me Back (${notFollowingBackCount})`;
        document.querySelector('h3:nth-of-type(3)').textContent = `Not Followed Back (${notFollowedBackCount})`;

        // Populate Not Following Back List
        data.not_following_back.forEach(username => {
            const li = document.createElement('li');
            li.textContent = username;
            notFollowingBack.appendChild(li);
        });

        // Populate Not Followed Back List
        data.not_followed_back.forEach(username => {
            const li = document.createElement('li');
            li.textContent = username;
            notFollowedBack.appendChild(li);
        });

        results.style.display = 'block';
    }
}


function handleError(error) {
    showError(`Error: ${error}`);
}

function showError(message) {
    status.textContent = message;
    status.classList.add('error');
    status.classList.remove('success');
    results.style.display = 'block';
}

function resetResults() {
    results.style.display = 'none';
    status.textContent = '';
    status.classList.remove('error', 'success');
    notFollowingBack.innerHTML = '';
    notFollowedBack.innerHTML = '';
}

function showModal() {
    modalOverlay.style.display = 'flex';
}

function hideModal() {
    modalOverlay.style.display = 'none';
}
