/**
 * Datos Mock para DiscoveryShop
 * Se usan cuando el backend no está disponible
 */

const MOCK_PRODUCTS = {
    data: {
        products: [
            {
                id: 1,
                title: "iPhone 14 Pro Max",
                description: "iPhone 14 Pro Max en perfecto estado, con caja original y accesorios",
                price: 1200,
                category: "Electrónica",
                seller: {
                    name: "Juan Pérez",
                    rating: 4.8,
                    reviews: 45
                },
                rating: 4.8,
                image: "https://via.placeholder.com/300x300?text=iPhone+14+Pro",
                location: { lat: 40.7128, lng: -74.0060 },
                tags: ["teléfono", "apple", "usado"]
            },
            {
                id: 2,
                title: "Laptop Dell XPS 15",
                description: "Laptop de gaming con RTX 3060, 16GB RAM, SSD 512GB",
                price: 1500,
                category: "Computadoras",
                seller: {
                    name: "María García",
                    rating: 4.9,
                    reviews: 62
                },
                rating: 4.9,
                image: "https://via.placeholder.com/300x300?text=Dell+XPS",
                location: { lat: 34.0522, lng: -118.2437 },
                tags: ["laptop", "gaming", "dell"]
            },
            {
                id: 3,
                title: "Samsung Galaxy Watch 5",
                description: "Reloj inteligente Samsung Galaxy Watch 5, color negro",
                price: 350,
                category: "Accesorios",
                seller: {
                    name: "Carlos López",
                    rating: 4.7,
                    reviews: 28
                },
                rating: 4.7,
                image: "https://via.placeholder.com/300x300?text=Galaxy+Watch",
                location: { lat: 41.8781, lng: -87.6298 },
                tags: ["reloj", "samsung", "smartwatch"]
            },
            {
                id: 4,
                title: "Sony WH-1000XM5 Headphones",
                description: "Auriculares con cancelación de ruido, 30 horas de batería",
                price: 380,
                category: "Audio",
                seller: {
                    name: "Ana Martínez",
                    rating: 4.6,
                    reviews: 35
                },
                rating: 4.6,
                image: "https://via.placeholder.com/300x300?text=Sony+Headphones",
                location: { lat: 37.7749, lng: -122.4194 },
                tags: ["auriculares", "sony", "audio"]
            },
            {
                id: 5,
                title: "PlayStation 5 Console",
                description: "PS5 con dos controles y juegos incluidos",
                price: 650,
                category: "Gaming",
                seller: {
                    name: "Roberto Sánchez",
                    rating: 5,
                    reviews: 18
                },
                rating: 5,
                image: "https://via.placeholder.com/300x300?text=PlayStation+5",
                location: { lat: 39.7392, lng: -104.9903 },
                tags: ["consola", "playstation", "gaming"]
            },
            {
                id: 6,
                title: "GoPro Hero 11 Black",
                description: "Cámara de acción 5.3K, impermeable hasta 33m",
                price: 450,
                category: "Cámaras",
                seller: {
                    name: "Fernando Ruiz",
                    rating: 4.8,
                    reviews: 22
                },
                rating: 4.8,
                image: "https://via.placeholder.com/300x300?text=GoPro+Hero+11",
                location: { lat: 47.6062, lng: -122.3321 },
                tags: ["cámara", "gopro", "acción"]
            },
            {
                id: 7,
                title: "iPad Air 5",
                description: "iPad Air 64GB color plata, con funda y stylus",
                price: 700,
                category: "Tablets",
                seller: {
                    name: "Elena Gómez",
                    rating: 4.9,
                    reviews: 41
                },
                rating: 4.9,
                image: "https://via.placeholder.com/300x300?text=iPad+Air",
                location: { lat: 42.3601, lng: -71.0589 },
                tags: ["tablet", "ipad", "apple"]
            },
            {
                id: 8,
                title: "DJI Mini 3 Pro Drone",
                description: "Dron compacto con cámara 4K y batería de 38 min",
                price: 550,
                category: "Drones",
                seller: {
                    name: "Diego Torres",
                    rating: 4.7,
                    reviews: 19
                },
                rating: 4.7,
                image: "https://via.placeholder.com/300x300?text=DJI+Mini+3",
                location: { lat: 25.7617, lng: -80.1918 },
                tags: ["dron", "dji", "4k"]
            }
        ]
    }
};

const MOCK_CATEGORIES = {
    data: {
        categories: [
            { name: "Electrónica", icon: "📱", count: 25 },
            { name: "Computadoras", icon: "💻", count: 18 },
            { name: "Audio", icon: "🎵", count: 12 },
            { name: "Gaming", icon: "🎮", count: 22 },
            { name: "Cámaras", icon: "📷", count: 14 },
            { name: "Tablets", icon: "📱", count: 8 },
            { name: "Accesorios", icon: "🔌", count: 35 },
            { name: "Drones", icon: "🛸", count: 6 }
        ]
    }
};

// Función para simular una espera de red
async function simulateNetworkDelay(ms = 300) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
