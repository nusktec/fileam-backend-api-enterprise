# SlantMenu Backend

A comprehensive backend API for the SlantMenu application.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Configuration](#configuration)
- [API Documentation](#api-documentation)
  - [Base URL](#base-url)
  - [Authentication](#authentication)
  - [Endpoints](#endpoints)
- [Usage Examples](#usage-examples)
- [Error Handling](#error-handling)
- [Contributing](#contributing)
- [License](#license)

## Overview

SlantMenu Backend provides a robust API for managing menu items, orders, and user interactions. Built with modern web technologies to ensure scalability and performance.

## Features

- 🍽️ Menu management
- 👤 User authentication and authorization
- 📝 Order processing
- 🔍 Search and filtering capabilities
- 📊 Analytics and reporting
- 🔒 Secure API endpoints
- 📱 Mobile-friendly responses

## Getting Started

### Prerequisites

- Node.js (version 16.0 or higher)
- npm or yarn
- Database (MongoDB/PostgreSQL/MySQL)
- API testing tool (Postman recommended)

### Installation

1. Clone the repository:

```bash
git clone https://github.com/kingakidi/slantmenu_backend.git
cd slantmenu_backend
```

2. Install dependencies:

```bash
npm install
# or
yarn install
```

3. Set up environment variables:

```bash
cp .env.example .env
```

4. Start the development server:

```bash
npm run dev
# or
yarn dev
```

### Configuration

Create a `.env` file in the root directory with the following variables:

```env
PORT=3000
DATABASE_URL=your_database_connection_string
JWT_SECRET=your_jwt_secret_key
API_KEY=your_api_key
ENVIRONMENT=development
```

## API Documentation

### Base URL

```
Production: https://api.slantmenu.com
Development: http://localhost:3000
```

### Authentication

The API uses JWT (JSON Web Tokens) for authentication. Include the token in the Authorization header:

```
Authorization: Bearer your_jwt_token_here
```

### Endpoints

#### Authentication

| Method | Endpoint         | Description       | Auth Required |
| ------ | ---------------- | ----------------- | ------------- |
| POST   | `/auth/login`    | User login        | No            |
| POST   | `/auth/register` | User registration | No            |
| POST   | `/auth/logout`   | User logout       | Yes           |
| GET    | `/auth/profile`  | Get user profile  | Yes           |

#### Menu Management

| Method | Endpoint          | Description            | Auth Required |
| ------ | ----------------- | ---------------------- | ------------- |
| GET    | `/menu/items`     | Get all menu items     | No            |
| GET    | `/menu/items/:id` | Get specific menu item | No            |
| GET    | `/menu/qr/:qrCode`| Get menus by QR code   | No            |
| POST   | `/menu/items`     | Create menu item       | Yes (Admin)   |
| PUT    | `/menu/items/:id` | Update menu item       | Yes (Admin)   |
| DELETE | `/menu/items/:id` | Delete menu item       | Yes (Admin)   |

#### Orders

| Method | Endpoint      | Description         | Auth Required |
| ------ | ------------- | ------------------- | ------------- |
| GET    | `/orders`     | Get user orders     | Yes           |
| POST   | `/orders`     | Create new order    | Yes           |
| GET    | `/orders/:id` | Get specific order  | Yes           |
| PUT    | `/orders/:id` | Update order status | Yes           |

#### Search & Filters

| Method | Endpoint       | Description        | Auth Required |
| ------ | -------------- | ------------------ | ------------- |
| GET    | `/search`      | Search menu items  | No            |
| GET    | `/categories`  | Get all categories | No            |
| GET    | `/menu/filter` | Filter menu items  | No            |

## Usage Examples

### Login User

```bash
curl -X POST https://api.slantmenu.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123"
  }'
```

Response:

```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "123",
      "email": "user@example.com",
      "name": "John Doe"
    }
  }
}
```

### Get Menu Items

```bash
curl -X GET https://api.slantmenu.com/menu/items \
  -H "Content-Type: application/json"
```

Response:

```json
{
  "success": true,
  "data": [
    {
      "id": "1",
      "name": "Margherita Pizza",
      "description": "Fresh tomatoes, mozzarella, and basil",
      "price": 12.99,
      "category": "Pizza",
      "available": true
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 25
  }
}
```

### Create Order

```bash
curl -X POST https://api.slantmenu.com/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_jwt_token" \
  -d '{
    "items": [
      {
        "menuItemId": "1",
        "quantity": 2,
        "specialInstructions": "Extra cheese"
      }
    ],
    "deliveryAddress": "123 Main St, City, State 12345"
  }'
```

### Search Menu Items

```bash
curl -X GET "https://api.slantmenu.com/search?q=pizza&category=main&maxPrice=15" \
  -H "Content-Type: application/json"
```

### Get Menus by QR Code

```bash
curl -X GET "https://api.slantmenu.com/menu/qr/abc123def456" \
  -H "Content-Type: application/json"
```

Response:

```json
{
  "success": true,
  "message": "Menus retrieved successfully by QR code",
  "data": {
    "categories": [
      {
        "id": "category-uuid",
        "name": "Appetizers",
        "logo": "https://example.com/appetizers.jpg",
        "menuCount": 3,
        "menus": [
          {
            "id": "menu-uuid",
            "name": "Buffalo Wings",
            "price": 8.99,
            "promo_period": false,
            "discount": 0,
            "quantity": 50,
            "not_quantity_base": false,
            "status": "active",
            "tags": ["spicy", "wings"],
            "createdAt": "2024-01-01T00:00:00.000Z",
            "updatedAt": "2024-01-01T00:00:00.000Z"
          }
        ]
      }
    ],
    "totalCategories": 1,
    "totalMenus": 3
  }
}
```

## Error Handling

The API uses conventional HTTP status codes and returns errors in the following format:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid email or password",
    "details": "The provided credentials do not match our records"
  }
}
```

### Common Error Codes

- `400 Bad Request` - Invalid request parameters
- `401 Unauthorized` - Authentication required
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource not found
- `422 Unprocessable Entity` - Validation errors
- `500 Internal Server Error` - Server error

## Postman Collection

You can test all endpoints using our Postman collection:

**Import the collection:** [Postman Collection Link](https://warped-astronaut-66444.postman.co/workspace/Team-Workspace~1852d4ee-e898-4b54-817d-a1f47943f82a/collection/12966907-3289f8cd-ff96-4b11-b84a-383c0afbab32)

The collection includes:

- Pre-configured environment variables
- Authentication examples
- All available endpoints with sample requests
- Automated tests for response validation

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Support

For questions or support, please contact:

- Email: support@slantmenu.com
- Documentation: [API Docs](https://docs.slantmenu.com)
- Issues: [GitHub Issues](https://github.com/yourusername/slantmenu_backend/issues)
