const path = require('path');

/**
 * Fetches a raw file from GitHub
 * @param {string} owner - Repo owner
 * @param {string} repo - Repo name
 * @param {string} filePath - Path to file in repo
 * @param {string} branch - Branch name (default: main)
 * @returns {Promise<string>} - File content
 */
async function fetchRawFile(owner, repo, filePath, branch = 'main') {
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.statusText}`);
    }
    return await response.text();
}

/**
 * Fetches a list of files from a directory in a GitHub repo
 * @param {string} owner 
 * @param {string} repo 
 * @param {string} dirPath 
 * @returns {Promise<Array>}
 */
async function fetchRepoContents(owner, repo, dirPath = '') {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${dirPath}`;
    const headers = {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'QWERTY-Quest-App'
    };

    if (process.env.GITHUB_ACCESS_TOKEN) {
        headers['Authorization'] = `token ${process.env.GITHUB_ACCESS_TOKEN}`;
    }

    const response = await fetch(url, { headers });
    if (!response.ok) {
        throw new Error(`Failed to fetch contents: ${response.statusText}`);
    }
    return await response.json();
}

const LANGUAGES_MAP = {
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.py': 'python',
    '.rs': 'rust',
    '.go': 'go',
    '.java': 'java',
    '.cpp': 'cpp',
    '.c': 'c',
    '.css': 'css',
    '.html': 'html'
};

/**
 * Picks a random code snippet from a trending-like repo
 */
async function getRandomCodeSnippet() {
    const popularRepos = [
        { owner: 'facebook', repo: 'react', dir: 'packages/react/src' },
        { owner: 'rust-lang', repo: 'rust', dir: 'library/core/src' },
        { owner: 'tensorflow', repo: 'tensorflow', dir: 'tensorflow/python' },
        { owner: 'golang', repo: 'go', dir: 'src/net' },
        { owner: 'microsoft', repo: 'vscode', dir: 'src/vs/base/common' }
    ];

    const target = popularRepos[Math.floor(Math.random() * popularRepos.length)];
    const contents = await fetchRepoContents(target.owner, target.repo, target.dir);
    
    // Filter for code files
    const codeFiles = contents.filter(file => {
        const ext = path.extname(file.name);
        return file.type === 'file' && LANGUAGES_MAP[ext];
    });

    if (codeFiles.length === 0) throw new Error("No code files found in directory");

    const file = codeFiles[Math.floor(Math.random() * codeFiles.length)];
    let content = await fetchRawFile(target.owner, target.repo, file.path);

    // Basic cleaning: remove very long files, take a chunk
    const lines = content.split('\n');
    const maxLines = 20;
    const startLine = Math.floor(Math.random() * Math.max(1, lines.length - maxLines));
    const chunk = lines.slice(startLine, startLine + maxLines).join('\n');

    return {
        content: chunk.trim(),
        language: LANGUAGES_MAP[path.extname(file.name)],
        source: `https://github.com/${target.owner}/${target.repo}/blob/main/${file.path}`,
        difficulty: chunk.length > 500 ? 'hard' : (chunk.length > 200 ? 'medium' : 'easy')
    };
}

module.exports = {
    fetchRawFile,
    fetchRepoContents,
    getRandomCodeSnippet
};
