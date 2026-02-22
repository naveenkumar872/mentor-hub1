/**
 * Input Validation Schemas using Zod
 * Centralized validation for all API endpoints
 */
const { z } = require('zod');

// ==================== AUTH SCHEMAS ====================

const loginSchema = z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(1, 'Password is required')
});

const createUserSchema = z.object({
    name: z.string().min(2, 'Name must be at least 2 characters').max(100),
    email: z.string().email('Invalid email format'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    role: z.enum(['student', 'mentor', 'admin'], { errorMap: () => ({ message: 'Role must be student, mentor, or admin' }) }),
    mentorId: z.string().optional().nullable(),
    batch: z.string().optional().nullable(),
    phone: z.string().optional().nullable()
});

const resetPasswordSchema = z.object({
    newPassword: z.string().min(6, 'Password must be at least 6 characters')
});

// ==================== TASK SCHEMAS ====================

const createTaskSchema = z.object({
    mentorId: z.string().min(1, 'Mentor ID is required'),
    title: z.string().min(1, 'Title is required').max(500),
    description: z.string().optional().default(''),
    studentIds: z.union([
        z.array(z.string()),
        z.string()
    ]).optional(),
    dueDate: z.string().optional().nullable(),
    priority: z.enum(['low', 'medium', 'high']).optional().default('medium')
});

// ==================== PROBLEM SCHEMAS ====================

const createProblemSchema = z.object({
    title: z.string().min(1, 'Title is required').max(500),
    description: z.string().min(1, 'Description is required'),
    difficulty: z.enum(['Easy', 'Medium', 'Hard']).optional().default('Easy'),
    language: z.string().optional().default('Python'),
    mentorId: z.string().min(1, 'Mentor ID is required'),
    category: z.string().optional().default('general'),
    maxAttempts: z.union([z.number(), z.string().transform(Number)]).optional().default(0),
    type: z.string().optional().default('Coding'),
    // Additional fields used by the route handler
    status: z.string().optional().default('live'),
    deadline: z.string().optional().nullable(),
    sampleInput: z.string().optional().default(''),
    expectedOutput: z.string().optional().default(''),
    sqlSchema: z.string().optional().nullable(),
    expectedQueryResult: z.string().optional().nullable(),
    // Proctoring settings
    enableProctoring: z.boolean().optional().default(false),
    enableVideoAudio: z.boolean().optional().default(false),
    disableCopyPaste: z.boolean().optional().default(false),
    trackTabSwitches: z.boolean().optional().default(false),
    maxTabSwitches: z.union([z.number(), z.string().transform(Number)]).optional().default(3),
    enableFaceDetection: z.boolean().optional().default(false),
    detectMultipleFaces: z.boolean().optional().default(false),
    trackFaceLookaway: z.boolean().optional().default(false)
}).passthrough();

// ==================== SUBMISSION SCHEMAS ====================

const createSubmissionSchema = z.object({
    studentId: z.string().min(1, 'Student ID is required'),
    problemId: z.string().min(1, 'Problem ID is required'),
    code: z.string().min(1, 'Code is required'),
    language: z.enum(['Python', 'JavaScript', 'Java', 'C', 'C++', 'SQL']),
    studentName: z.string().optional(),
    mentorId: z.string().optional()
});

// ==================== MESSAGE SCHEMAS ====================

const sendMessageSchema = z.object({
    senderId: z.string().min(1, 'Sender ID is required'),
    receiverId: z.string().min(1, 'Receiver ID is required'),
    content: z.string().min(1, 'Message content is required').max(5000),
    senderName: z.string().optional(),
    senderRole: z.string().optional()
});

// ==================== BULK OPERATION SCHEMAS ====================

const bulkReassignSchema = z.object({
    studentIds: z.array(z.string()).min(1, 'At least one student ID is required'),
    newMentorId: z.string().min(1, 'New mentor ID is required'),
    adminId: z.string().optional(),
    adminName: z.string().optional()
});

const bulkDeleteSchema = z.object({
    submissionIds: z.array(z.string()).min(1, 'At least one submission ID is required'),
    adminId: z.string().optional(),
    adminName: z.string().optional()
});

// ==================== ADDITIONAL SCHEMAS ====================

const aptitudeSubmitSchema = z.object({
    studentId: z.string().min(1, 'Student ID is required'),
    testId: z.string().min(1, 'Test ID is required'),
    answers: z.array(z.object({
        questionId: z.string(),
        selectedOption: z.union([z.string(), z.number()])
    })).min(1),
    timeTaken: z.number().int().min(0).optional(),
    score: z.number().min(0).max(100).optional()
});

const globalTestSubmitSchema = z.object({
    studentId: z.string().min(1, 'Student ID is required'),
    testId: z.string().min(1, 'Test ID is required'),
    answers: z.array(z.object({
        questionId: z.string(),
        selectedOption: z.union([z.string(), z.number()])
    })).min(1),
    timeTaken: z.number().int().min(0).optional()
});

const plagiarismCheckSchema = z.object({
    submissionId: z.string().min(1, 'Submission ID is required'),
    studentId: z.string().min(1, 'Student ID is required'),
    code: z.string().min(10, 'Code must be at least 10 characters')
});

const createAptitudeSchema = z.object({
    title: z.string().min(1, 'Title is required').max(500),
    description: z.string().optional(),
    duration: z.number().int().min(1, 'Duration must be at least 1 minute'),
    totalQuestions: z.number().int().min(1),
    passingScore: z.number().min(0).max(100).optional().default(60),
    category: z.string().optional()
});

const updateProctoringSettingsSchema = z.object({
    detectFaceAbsence: z.boolean().optional(),
    detectCopyPaste: z.boolean().optional(),
    detectTabSwitch: z.boolean().optional(),
    detectPhoneUsage: z.boolean().optional(),
    detectCameraBlocking: z.boolean().optional(),
    allowedTools: z.array(z.string()).optional()
});

// ==================== VALIDATION MIDDLEWARE ====================

/**
 * Express middleware factory for validating request body
 * Usage: validate(loginSchema) 
 */
function validate(schema) {
    return (req, res, next) => {
        try {
            const result = schema.safeParse(req.body);
            if (!result.success) {
                const errors = result.error.errors.map(e => ({
                    field: e.path.join('.'),
                    message: e.message
                }));
                return res.status(400).json({
                    error: 'Validation failed',
                    details: errors
                });
            }
            // Replace body with parsed/coerced values
            req.body = result.data;
            next();
        } catch (error) {
            return res.status(400).json({ error: 'Invalid request data' });
        }
    };
}

/**
 * Validate query parameters
 */
function validateQuery(schema) {
    return (req, res, next) => {
        try {
            const result = schema.safeParse(req.query);
            if (!result.success) {
                const errors = result.error.errors.map(e => ({
                    field: e.path.join('.'),
                    message: e.message
                }));
                return res.status(400).json({
                    error: 'Invalid query parameters',
                    details: errors
                });
            }
            req.query = result.data;
            next();
        } catch (error) {
            return res.status(400).json({ error: 'Invalid query parameters' });
        }
    };
}

module.exports = {
    // Schemas
    loginSchema,
    createUserSchema,
    resetPasswordSchema,
    createTaskSchema,
    createProblemSchema,
    createSubmissionSchema,
    sendMessageSchema,
    bulkReassignSchema,
    bulkDeleteSchema,
    aptitudeSubmitSchema,
    globalTestSubmitSchema,
    plagiarismCheckSchema,
    createAptitudeSchema,
    updateProctoringSettingsSchema,
    // Middleware
    validate,
    validateQuery
};
