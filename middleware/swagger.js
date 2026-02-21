/**
 * Swagger/OpenAPI Configuration
 * Auto-generates API documentation at /api-docs
 */

function setupSwagger(app) {
    let swaggerJsDoc, swaggerUi;

    try {
        swaggerJsDoc = require('swagger-jsdoc');
        swaggerUi = require('swagger-ui-express');
    } catch (error) {
        console.warn('⚠️ Swagger packages not installed. Run: npm install swagger-jsdoc swagger-ui-express');
        console.warn('   API docs will not be available at /api-docs');
        return;
    }

    const swaggerOptions = {
        definition: {
            openapi: '3.0.0',
            info: {
                title: 'Mentor Hub API',
                version: '2.0.0',
                description: `
# Mentor Hub API Documentation

A comprehensive mentor-student education platform API with:
- **Authentication**: JWT-based auth with role-based access control
- **User Management**: CRUD for students, mentors, and admins
- **Problems & Tasks**: Create, assign, and track coding problems and tasks
- **Submissions**: AI-evaluated code submissions with plagiarism detection
- **Tests**: Aptitude, global, and skill tests with proctoring
- **Analytics**: Student performance, leaderboards, and learning paths
- **Real-time**: WebSocket-based live monitoring and messaging
- **Admin**: Bulk operations, backups, exports, and audit logs
                `,
                contact: {
                    name: 'Mentor Hub Team'
                }
            },
            servers: [
                {
                    url: 'http://localhost:3000',
                    description: 'Development server'
                }
            ],
            components: {
                securitySchemes: {
                    BearerAuth: {
                        type: 'http',
                        scheme: 'bearer',
                        bearerFormat: 'JWT',
                        description: 'Enter your JWT token obtained from /api/auth/login'
                    }
                },
                schemas: {
                    User: {
                        type: 'object',
                        properties: {
                            id: { type: 'string', example: 'student-001' },
                            name: { type: 'string', example: 'John Doe' },
                            email: { type: 'string', example: 'john@example.com' },
                            role: { type: 'string', enum: ['student', 'mentor', 'admin'] },
                            batch: { type: 'string', example: 'Batch A' },
                            status: { type: 'string', enum: ['active', 'inactive', 'suspended'] }
                        }
                    },
                    LoginRequest: {
                        type: 'object',
                        required: ['email', 'password'],
                        properties: {
                            email: { type: 'string', example: 'admin@mentorhub.com' },
                            password: { type: 'string', example: 'password123' }
                        }
                    },
                    LoginResponse: {
                        type: 'object',
                        properties: {
                            success: { type: 'boolean' },
                            token: { type: 'string', description: 'JWT Bearer token' },
                            user: { $ref: '#/components/schemas/User' }
                        }
                    },
                    Problem: {
                        type: 'object',
                        properties: {
                            id: { type: 'string' },
                            title: { type: 'string' },
                            description: { type: 'string' },
                            difficulty: { type: 'string', enum: ['Easy', 'Medium', 'Hard'] },
                            language: { type: 'string' },
                            mentorId: { type: 'string' },
                            category: { type: 'string' }
                        }
                    },
                    Submission: {
                        type: 'object',
                        properties: {
                            id: { type: 'string' },
                            studentId: { type: 'string' },
                            problemId: { type: 'string' },
                            code: { type: 'string' },
                            language: { type: 'string' },
                            status: { type: 'string', enum: ['accepted', 'rejected', 'partial'] },
                            score: { type: 'number' }
                        }
                    },
                    Error: {
                        type: 'object',
                        properties: {
                            error: { type: 'string' },
                            details: { type: 'array', items: { type: 'object' } }
                        }
                    },
                    PaginatedResponse: {
                        type: 'object',
                        properties: {
                            data: { type: 'array', items: {} },
                            pagination: {
                                type: 'object',
                                properties: {
                                    page: { type: 'integer' },
                                    limit: { type: 'integer' },
                                    total: { type: 'integer' },
                                    pages: { type: 'integer' },
                                    hasNextPage: { type: 'boolean' },
                                    hasPreviousPage: { type: 'boolean' }
                                }
                            }
                        }
                    }
                }
            },
            tags: [
                { name: 'Auth', description: 'Authentication endpoints' },
                { name: 'Users', description: 'User management' },
                { name: 'Tasks', description: 'Task management' },
                { name: 'Problems', description: 'Coding problems' },
                { name: 'Submissions', description: 'Code submissions' },
                { name: 'Tests', description: 'Aptitude, Global & Skill tests' },
                { name: 'Analytics', description: 'Performance analytics' },
                { name: 'AI', description: 'AI-powered features' },
                { name: 'Plagiarism', description: 'Plagiarism detection' },
                { name: 'Proctoring', description: 'Exam proctoring' },
                { name: 'Messages', description: 'Direct messaging' },
                { name: 'Admin', description: 'Admin operations' }
            ],
            // Manually define key paths since JSDoc comments would be too invasive
            paths: {
                '/api/auth/login': {
                    post: {
                        tags: ['Auth'],
                        summary: 'Login',
                        description: 'Authenticate user and receive JWT token',
                        requestBody: {
                            required: true,
                            content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } } }
                        },
                        responses: {
                            200: { description: 'Login successful', content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginResponse' } } } },
                            401: { description: 'Invalid credentials' }
                        }
                    }
                },
                '/api/users': {
                    get: {
                        tags: ['Users'], summary: 'Get all users', security: [{ BearerAuth: [] }],
                        parameters: [
                            { name: 'role', in: 'query', schema: { type: 'string' } },
                            { name: 'mentorId', in: 'query', schema: { type: 'string' } }
                        ],
                        responses: { 200: { description: 'List of users' } }
                    }
                },
                '/api/problems': {
                    get: {
                        tags: ['Problems'], summary: 'Get all problems', security: [{ BearerAuth: [] }],
                        responses: { 200: { description: 'List of problems' } }
                    },
                    post: {
                        tags: ['Problems'], summary: 'Create a problem', security: [{ BearerAuth: [] }],
                        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Problem' } } } },
                        responses: { 200: { description: 'Problem created' } }
                    }
                },
                '/api/submissions': {
                    get: {
                        tags: ['Submissions'], summary: 'Get all submissions', security: [{ BearerAuth: [] }],
                        parameters: [
                            { name: 'studentId', in: 'query', schema: { type: 'string' } },
                            { name: 'problemId', in: 'query', schema: { type: 'string' } },
                            { name: 'status', in: 'query', schema: { type: 'string' } }
                        ],
                        responses: { 200: { description: 'List of submissions' } }
                    },
                    post: {
                        tags: ['Submissions'], summary: 'Submit code for evaluation', security: [{ BearerAuth: [] }],
                        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Submission' } } } },
                        responses: { 200: { description: 'Submission evaluated' } }
                    }
                },
                '/api/tasks': {
                    get: { tags: ['Tasks'], summary: 'Get all tasks', security: [{ BearerAuth: [] }], responses: { 200: { description: 'List of tasks' } } },
                    post: { tags: ['Tasks'], summary: 'Create a task', security: [{ BearerAuth: [] }], responses: { 200: { description: 'Task created' } } }
                },
                '/api/run': {
                    post: { tags: ['Submissions'], summary: 'Run code without submitting', security: [{ BearerAuth: [] }], responses: { 200: { description: 'Code execution result' } } }
                },
                '/api/ai/chat': {
                    post: { tags: ['AI'], summary: 'AI chat interaction', security: [{ BearerAuth: [] }], responses: { 200: { description: 'AI response' } } }
                },
                '/api/ai/generate-problem': {
                    post: { tags: ['AI'], summary: 'Generate a coding problem with AI', security: [{ BearerAuth: [] }], responses: { 200: { description: 'Generated problem' } } }
                },
                '/api/global-tests': {
                    get: { tags: ['Tests'], summary: 'List global tests', security: [{ BearerAuth: [] }], responses: { 200: { description: 'List of global tests' } } },
                    post: { tags: ['Tests'], summary: 'Create global test', security: [{ BearerAuth: [] }], responses: { 200: { description: 'Test created' } } }
                },
                '/api/aptitude': {
                    get: { tags: ['Tests'], summary: 'List aptitude tests', security: [{ BearerAuth: [] }], responses: { 200: { description: 'List of aptitude tests' } } },
                    post: { tags: ['Tests'], summary: 'Create aptitude test', security: [{ BearerAuth: [] }], responses: { 200: { description: 'Test created' } } }
                },
                '/api/leaderboard': {
                    get: { tags: ['Analytics'], summary: 'Get student leaderboard', security: [{ BearerAuth: [] }], responses: { 200: { description: 'Leaderboard data' } } }
                },
                '/api/analytics/student/{studentId}': {
                    get: { tags: ['Analytics'], summary: 'Get student analytics', security: [{ BearerAuth: [] }], parameters: [{ name: 'studentId', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Student analytics' } } }
                },
                '/api/plagiarism/analyze/{submissionId}': {
                    post: { tags: ['Plagiarism'], summary: 'Analyze submission for plagiarism', security: [{ BearerAuth: [] }], parameters: [{ name: 'submissionId', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Plagiarism analysis result' } } }
                },
                '/api/proctoring/start-exam': {
                    post: { tags: ['Proctoring'], summary: 'Start a proctored exam session', security: [{ BearerAuth: [] }], responses: { 200: { description: 'Proctoring session started' } } }
                },
                '/api/messages': {
                    post: { tags: ['Messages'], summary: 'Send a direct message', security: [{ BearerAuth: [] }], responses: { 200: { description: 'Message sent' } } }
                },
                '/api/admin/users': {
                    get: { tags: ['Admin'], summary: 'List all users (admin)', security: [{ BearerAuth: [] }], responses: { 200: { description: 'User list' } } },
                    post: { tags: ['Admin'], summary: 'Create a user (admin)', security: [{ BearerAuth: [] }], responses: { 200: { description: 'User created' } } }
                },
                '/api/admin/system-health': {
                    get: { tags: ['Admin'], summary: 'Get system health metrics', security: [{ BearerAuth: [] }], responses: { 200: { description: 'System health data' } } }
                },
                '/api/admin/audit-logs': {
                    get: { tags: ['Admin'], summary: 'Get audit logs', security: [{ BearerAuth: [] }], responses: { 200: { description: 'Audit log entries' } } }
                },
                '/api/admin/export/{type}': {
                    get: { tags: ['Admin'], summary: 'Export data as CSV', security: [{ BearerAuth: [] }], parameters: [{ name: 'type', in: 'path', required: true, schema: { type: 'string', enum: ['users', 'submissions', 'problems', 'tasks'] } }], responses: { 200: { description: 'CSV file download' } } }
                }
            }
        },
        apis: [] // We use inline path definitions above
    };

    const swaggerSpec = swaggerJsDoc(swaggerOptions);
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
        customSiteTitle: 'Mentor Hub API Docs',
        customCss: '.swagger-ui .topbar { background-color: #1a1a2e; }',
        swaggerOptions: {
            persistAuthorization: true
        }
    }));

    console.log('📚 API docs available at /api-docs');
}

module.exports = setupSwagger;
