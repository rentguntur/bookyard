// src/services/api.js
import axios from 'axios';

// Use relative path to leverage the Netlify proxy (defined in netlify.toml)
// This avoids CORS issues by making requests to the same origin coverage
const API_BASE_URL = '';

// Create axios instance with default config
const apiClient = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Response interceptor for error handling
apiClient.interceptors.response.use(
    (response) => response,
    (error) => {
        console.error('API Error:', error.response?.data || error.message);
        return Promise.reject(error);
    }
);

// Helper to get current user ID/Email safely
const getCurrentUserEmail = () => {
    try {
        const userStr = localStorage.getItem('user');
        return userStr ? JSON.parse(userStr).email : null;
    } catch (e) {
        return null;
    }
};

// Helper to get owners map
const getBookOwners = () => {
    try {
        return JSON.parse(localStorage.getItem('book_owners') || '{}');
    } catch {
        return {};
    }
};

// Books APIs
export const booksAPI = {
    // Create a new book
    create: async (bookData) => {
        const response = await apiClient.post('/api/books', bookData);
        const newBook = response.data;

        // Save ownership
        const currentUserEmail = getCurrentUserEmail();
        if (currentUserEmail && newBook.id) {
            const owners = getBookOwners();
            owners[newBook.id] = {
                email: currentUserEmail,
                name: JSON.parse(localStorage.getItem('user')).name
            };
            localStorage.setItem('book_owners', JSON.stringify(owners));
        }

        return newBook;
    },

    // List all books with pagination
    list: async (skip = 0, limit = 10) => {
        const response = await apiClient.get('/api/books', {
            params: { skip, limit }
        });

        // Attach ownership info
        const owners = getBookOwners();
        const books = response.data.map(book => ({
            ...book,
            addedBy: owners[book.id]?.name || 'Admin', // Default to Admin for old books
            ownerEmail: owners[book.id]?.email,
        }));

        return books;
    },

    // Get book by ID
    getById: async (bookId) => {
        const response = await apiClient.get(`/api/books/${bookId}`);
        const owners = getBookOwners();
        return {
            ...response.data,
            addedBy: owners[bookId]?.name || 'Admin',
            ownerEmail: owners[bookId]?.email
        };
    },

    // Update book
    update: async (bookId, bookData) => {
        // Ownership check
        const owners = getBookOwners();
        const ownerEmail = owners[bookId]?.email;
        const currentUserEmail = getCurrentUserEmail();

        // Only enforce if the book HAS an owner. If it's an old 'Admin' book, maybe allow? 
        // Strict mode: if owner exists and mismatch, block.
        if (ownerEmail && ownerEmail !== currentUserEmail) {
            throw new Error('Unauthorized: You can only edit books you added.');
        }

        const response = await apiClient.put(`/api/books/${bookId}`, bookData);
        return response.data;
    },

    // Delete book
    delete: async (bookId) => {
        // Ownership check
        const owners = getBookOwners();
        const ownerEmail = owners[bookId]?.email;
        const currentUserEmail = getCurrentUserEmail();

        if (ownerEmail && ownerEmail !== currentUserEmail) {
            throw new Error('Unauthorized: You can only delete books you added.');
        }

        const response = await apiClient.delete(`/api/books/${bookId}`);

        // Cleanup ownership
        if (owners[bookId]) {
            delete owners[bookId];
            localStorage.setItem('book_owners', JSON.stringify(owners));
        }

        return response.data;
    },

    // Search books (client-side filtering since API doesn't have search endpoint)
    search: async (query, skip = 0, limit = 100) => {
        const response = await apiClient.get('/api/books', {
            params: { skip, limit }
        });

        // Attach ownership info first
        const owners = getBookOwners();
        const allBooks = response.data.map(book => ({
            ...book,
            addedBy: owners[book.id]?.name || 'Admin',
            ownerEmail: owners[book.id]?.email,
        }));

        if (!query) return allBooks;

        // Client-side filtering
        const filtered = allBooks.filter(book =>
            book.title.toLowerCase().includes(query.toLowerCase()) ||
            book.author.toLowerCase().includes(query.toLowerCase()) ||
            book.isbn?.toLowerCase().includes(query.toLowerCase())
        );

        return filtered;
    }
};

// Health Check
export const healthAPI = {
    check: async () => {
        const response = await apiClient.get('/health');
        return response.data;
    }
};

// Root endpoint
export const rootAPI = {
    get: async () => {
        const response = await apiClient.get('/');
        return response.data;
    }
};

export default apiClient;