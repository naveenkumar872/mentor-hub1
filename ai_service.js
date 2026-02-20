/**
 * AI Service Module - Cerebras-powered question generation & evaluation
 * Used for Skill Test system (MCQ, Coding, SQL, Interview, Reports)
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const CEREBRAS_API_URL = 'https://api.cerebras.ai/v1/chat/completions';

// Get all available API keys
function getCerebrasKeys() {
    const keys = [];
    if (process.env.CEREBRAS_API_KEY) keys.push(process.env.CEREBRAS_API_KEY);
    if (process.env.cereberas_api_key) keys.push(process.env.cereberas_api_key);
    for (let i = 1; i <= 4; i++) {
        const k = process.env[`CEREBRAS_API_KEY_${i}`];
        if (k) keys.push(k);
    }
    return [...new Set(keys)].filter(k => k && k.trim().length > 0);
}

// Call Cerebras API with key rotation
async function callCerebras(messages, options = {}) {
    const keys = getCerebrasKeys();
    if (keys.length === 0) throw new Error('No Cerebras API keys configured');

    let lastError = null;
    for (const apiKey of keys) {
        try {
            const response = await fetch(CEREBRAS_API_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: options.model || 'gpt-oss-120b',
                    messages,
                    temperature: options.temperature || 0.7,
                    max_tokens: options.max_tokens || 4096,
                    ...(options.response_format && { response_format: options.response_format })
                })
            });

            if (!response.ok) {
                lastError = new Error(`API Error ${response.status}`);
                continue;
            }

            const data = await response.json();
            return data.choices?.[0]?.message?.content || '';
        } catch (err) {
            lastError = err;
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s before next key
            continue;
        }
    }
    throw lastError || new Error('All Cerebras API keys failed');
}

// Parse JSON from AI response (handles markdown code blocks)
function parseJSON(text) {
    if (!text) return null;
    try {
        // Try direct parse
        return JSON.parse(text);
    } catch {
        // Try extracting from code blocks
        const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (codeBlock) {
            try { return JSON.parse(codeBlock[1].trim()); } catch { }
        }
        // Try finding JSON array or object
        const jsonMatch = text.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
        if (jsonMatch) {
            try { return JSON.parse(jsonMatch[1]); } catch { }
        }
        return null;
    }
}

// ═══════════════════════════════════════════
//  MCQ GENERATION
// ═══════════════════════════════════════════

// Random topic categories for variety
const TOPIC_POOLS = {
    concepts: ['design patterns', 'concurrency', 'memory management', 'error handling', 'testing', 'security', 'performance', 'architecture', 'debugging', 'deployment', 'networking', 'APIs', 'databases', 'caching', 'logging'],
    approaches: ['scenario-based', 'code-output prediction', 'bug-finding', 'best-practice identification', 'tradeoff analysis', 'real-world problem solving', 'optimization', 'architecture decision'],
    themes: ['e-commerce system', 'social media app', 'banking system', 'healthcare platform', 'logistics system', 'real-time chat', 'streaming service', 'IoT dashboard', 'machine learning pipeline', 'CI/CD workflow']
};

function getRandomSeed() {
    return Math.floor(Math.random() * 1000000);
}

function pickRandom(arr, n) {
    const shuffled = [...arr].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(n, arr.length));
}

async function generateMCQQuestions(skills, count = 10) {
    const skillsStr = skills.slice(0, 15).join(', ');
    const seed = getRandomSeed();
    const focusTopics = pickRandom(TOPIC_POOLS.concepts, 4).join(', ');
    const questionStyle = pickRandom(TOPIC_POOLS.approaches, 3).join(', ');

    const messages = [
        {
            role: 'system',
            content: `You are an expert technical interviewer. Generate multiple choice questions for a technical assessment.
Each question must be relevant to the candidate's skills and test practical knowledge.
Return ONLY a valid JSON array, no other text.
Each question object must have these exact fields:
- "id": number (1, 2, 3...)
- "question": string (the question text)
- "skill": string (which skill this tests)
- "difficulty": string ("easy", "medium", or "hard")
- "options": array of exactly 4 strings
- "correct_answer": number (0-3 index of correct option)
- "explanation": string (brief explanation of correct answer)`
        },
        {
            role: 'user',
            content: `[Seed: ${seed}] Generate ${count} UNIQUE technical MCQ questions based on these skills: ${skillsStr}

IMPORTANT: Generate completely NEW and UNIQUE questions every time. DO NOT use common or frequently-asked questions.
Focus on these specific topics for THIS session: ${focusTopics}
Use these question styles: ${questionStyle}

Distribution:
- 30% Easy questions (fundamentals)
- 50% Medium questions (practical application)  
- 20% Hard questions (advanced concepts)

Make questions practical and real-world oriented. Cover different skills proportionally.
Be creative and avoid generic questions like "What is X?" - instead test applied knowledge.
Return ONLY a valid JSON array.`
        }
    ];

    try {
        const response = await callCerebras(messages, { temperature: 0.95, max_tokens: 4000 });
        const questions = parseJSON(response);

        if (!questions || !Array.isArray(questions)) {
            return generateFallbackMCQ(skills, count);
        }

        // Validate and clean
        const valid = [];
        questions.forEach((q, i) => {
            if (q && q.question && q.options && typeof q.correct_answer === 'number') {
                q.id = i + 1;
                if (Array.isArray(q.options) && q.options.length >= 4) {
                    q.options = q.options.slice(0, 4);
                    valid.push(q);
                }
            }
        });

        return valid.length > 0 ? valid : generateFallbackMCQ(skills, count);
    } catch (err) {
        console.error('MCQ generation failed:', err.message);
        return generateFallbackMCQ(skills, count);
    }
}

function generateFallbackMCQ(skills, count) {
    const questions = [];
    for (let i = 0; i < Math.min(count, skills.length * 3); i++) {
        const skill = skills[i % skills.length];

        // Base options
        const optionsList = [
            `A fundamental principle of ${skill}`, // Correct
            `A framework commonly used with ${skill}`,
            `A design pattern in ${skill}`,
            `A tool used alongside ${skill}`
        ];

        // Shuffle options and find new index of the correct answer
        const correctOpt = optionsList[0];
        const shuffled = optionsList
            .map(value => ({ value, sort: Math.random() }))
            .sort((a, b) => a.sort - b.sort)
            .map(({ value }) => value);

        const correctIdx = shuffled.indexOf(correctOpt);

        questions.push({
            id: i + 1,
            question: `Which of the following best describes a core concept of ${skill}?`,
            skill,
            difficulty: i % 3 === 0 ? 'easy' : i % 3 === 1 ? 'medium' : 'hard',
            options: shuffled,
            correct_answer: correctIdx,
            explanation: `This is a fundamental concept in ${skill}.`
        });
    }
    return questions;
}

// ═══════════════════════════════════════════
//  CODING PROBLEM GENERATION
// ═══════════════════════════════════════════

async function generateCodingProblems(skills, count = 3, difficultyLevel = 'mixed') {
    const progSkills = skills.filter(s =>
        ['python', 'java', 'javascript', 'typescript', 'c++', 'c#', 'go', 'rust', 'c',
            'dsa', 'data structures', 'algorithms', 'react', 'node', 'express'].includes(s.toLowerCase())
    );
    const relevantSkills = progSkills.length > 0 ? progSkills : skills.slice(0, 3);
    const skillsStr = relevantSkills.slice(0, 5).join(', ');

    // Build difficulty instruction based on admin setting
    let difficultyInstruction = '';
    if (difficultyLevel === 'easy') {
        difficultyInstruction = `All ${count} problems should be "easy" difficulty (basic logic/implementation).`;
    } else if (difficultyLevel === 'medium') {
        difficultyInstruction = `All ${count} problems should be "medium" difficulty (data structures/algorithms).`;
    } else if (difficultyLevel === 'hard') {
        difficultyInstruction = `All ${count} problems should be "hard" difficulty (complex problem solving).`;
    } else {
        // mixed
        if (count === 1) difficultyInstruction = 'Generate 1 easy problem.';
        else if (count === 2) difficultyInstruction = 'Generate 1 easy and 1 medium problem.';
        else difficultyInstruction = `Distribute difficulty across easy, medium, and hard.`;
    }

    const messages = [
        {
            role: 'system',
            content: `You are an expert coding challenge designer. Generate coding problems for a technical assessment.
Return ONLY a valid JSON array with EXACTLY ${count} problems. Each problem object must have:
- "id": number
- "title": string
- "description": string (clear problem statement with examples)
- "difficulty": "easy" | "medium" | "hard"
- "skills_tested": array of strings
- "input_format": string
- "output_format": string
- "sample_input": string
- "sample_output": string
- "test_cases": array of objects with "input" and "expected_output" strings
- "starter_code": object with keys "python", "javascript", "java", "cpp". 
  This code must include:
  1. The solution function definition (empty or pass).
  2. Driver code that reads from STDIN, parses the input according to "input_format", calls the solution function, and prints the result to STDOUT.
  3. Comments indicating where the user should write their code.
- "time_limit_seconds": number
- "hints": array of strings (2-3 hints)`
        },
        {
            role: 'user',
            content: `[Seed: ${getRandomSeed()}] Generate EXACTLY ${count} UNIQUE coding problem(s) that test these skills: ${skillsStr}

${difficultyInstruction}

IMPORTANT: Generate completely DIFFERENT problems every time. Avoid common problems like Two Sum, FizzBuzz, Palindrome, Fibonacci, Reverse String. 
Think of creative, unique problem scenarios from: ${pickRandom(TOPIC_POOLS.themes, 3).join(', ')}.

Each problem should have at least 3 test cases.
Make sure the "starter_code" for each language is correct and runnable. It must handle the input parsing exactly as described in "input_format".
For example, if input is "space separated integers", the python driver code should use 'input().split()'.
Return ONLY a valid JSON array with exactly ${count} problem(s).`
        }
    ];

    try {
        const response = await callCerebras(messages, { temperature: 0.9, max_tokens: 4000 });
        let problems = parseJSON(response);
        if (problems && Array.isArray(problems) && problems.length > 0) {
            // Transform sample_input/output to examples format and trim to exact count
            problems = problems.slice(0, count).map((p, idx) => ({
                ...p,
                id: p.id || idx + 1,
                examples: p.sample_input && p.sample_output ? [{
                    input: p.sample_input,
                    output: p.sample_output,
                    explanation: p.sample_explanation || ''
                }] : (p.examples || [])
            }));
            return problems;
        }
        return generateFallbackCoding(skills, count, difficultyLevel);
    } catch (err) {
        console.error('Coding generation failed:', err.message);
        return generateFallbackCoding(skills, count, difficultyLevel);
    }
}

function generateFallbackCoding(skills, count = 3, difficultyLevel = 'mixed') {
    const allProblems = [
        {
            id: 1, title: 'Two Sum', difficulty: 'easy',
            description: 'Given an array of integers nums and an integer target, return indices of the two numbers that add up to target.',
            skills_tested: ['arrays', 'hash-maps'],
            input_format: 'First line: space-separated integers\nSecond line: target integer',
            output_format: 'Space-separated indices',
            sample_input: '2 7 11 15\n9', sample_output: '0 1',
            starter_code: {
                python: `import sys

def two_sum(nums, target):
    # Write your code here
    # Return a list of two indices [i, j]
    pass

# !!! DO NOT EDIT BELOW THIS LINE !!!
if __name__ == '__main__':
    try:
        input_line = sys.stdin.readline()
        if not input_line:
            exit(0)
        nums = list(map(int, input_line.split()))
        target = int(sys.stdin.readline())
        
        result = two_sum(nums, target)
        if result:
            print(f"{result[0]} {result[1]}")
    except Exception as e:
        pass`,
                javascript: `
const fs = require('fs');

function twoSum(nums, target) {
    // Write your code here
    // Return an array [i, j]
    return [];
}

// !!! DO NOT EDIT BELOW THIS LINE !!!
try {
    const input = fs.readFileSync(0, 'utf-8').trim().split('\\n');
    if (input.length >= 2) {
        const nums = input[0].trim().split(/\\s+/).map(Number);
        const target = Number(input[1].trim());
        const result = twoSum(nums, target);
        if (result && result.length === 2) {
            console.log(result.join(' '));
        }
    }
} catch (e) {}`,
                java: `import java.util.*;

public class Main {
    public static int[] twoSum(int[] nums, int target) {
        // Write your code here
        return new int[]{};
    }

    // !!! DO NOT EDIT BELOW THIS LINE !!!
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);
        if (scanner.hasNextLine()) {
            String[] parts = scanner.nextLine().trim().split("\\\\s+");
            int[] nums = new int[parts.length];
            for (int i = 0; i < parts.length; i++) {
                nums[i] = Integer.parseInt(parts[i]);
            }
            if (scanner.hasNextInt()) {
                int target = scanner.nextInt();
                int[] result = twoSum(nums, target);
                if (result.length == 2) {
                    System.out.println(result[0] + " " + result[1]);
                }
            }
        }
    }
}`,
                cpp: `#include <iostream>
#include <vector>
#include <sstream>
#include <unordered_map>

using namespace std;

vector<int> twoSum(vector<int>& nums, int target) {
    // Write your code here
    return {};
}

// !!! DO NOT EDIT BELOW THIS LINE !!!
int main() {
    string line;
    if (getline(cin, line)) {
        stringstream ss(line);
        int num;
        vector<int> nums;
        while (ss >> num) {
            nums.push_back(num);
        }
        int target;
        if (cin >> target) {
            vector<int> result = twoSum(nums, target);
            if (result.size() == 2) {
                cout << result[0] << " " << result[1] << endl;
            }
        }
    }
    return 0;
}`
            },
            examples: [{
                input: '2 7 11 15\n9',
                output: '0 1',
                explanation: 'nums[0] + nums[1] = 2 + 7 = 9'
            }],
            test_cases: [
                { input: '2 7 11 15\n9', expected_output: '0 1' },
                { input: '3 2 4\n6', expected_output: '1 2' },
                { input: '3 3\n6', expected_output: '0 1' }
            ],
            time_limit_seconds: 5, hints: ['Try using a hash map', 'Store complement values']
        },
        {
            id: 2, title: 'Valid Parentheses', difficulty: 'medium',
            description: 'Given a string containing just the characters \'(\', \')\', \'{\', \'}\', \'[\' and \']\', determine if the input string is valid.',
            skills_tested: ['stacks', 'string-processing'],
            input_format: 'A string of brackets', output_format: 'true or false',
            sample_input: '()[]{}', sample_output: 'true',
            starter_code: {
                python: `import sys

def isValid(s):
    # Write your code here
    return False

# !!! DO NOT EDIT BELOW THIS LINE !!!
if __name__ == '__main__':
    s = sys.stdin.read().strip()
    if s:
        print("true" if isValid(s) else "false")`,
                javascript: `
const fs = require('fs');

function isValid(s) {
    // Write your code here
    return false;
}

// !!! DO NOT EDIT BELOW THIS LINE !!!
try {
    const s = fs.readFileSync(0, 'utf-8').trim();
    if (s) {
        console.log(isValid(s) ? 'true' : 'false');
    }
} catch (e) {}`,
                java: `import java.util.*;

public class Main {
    public static boolean isValid(String s) {
        // Write your code here
        return false;
    }

    // !!! DO NOT EDIT BELOW THIS LINE !!!
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);
        if (scanner.hasNext()) {
            String s = scanner.next();
            System.out.println(isValid(s) ? "true" : "false");
        }
    }
}`,
                cpp: `#include <iostream>
#include <string>
#include <stack>

using namespace std;

bool isValid(string s) {
    // Write your code here
    return false;
}

// !!! DO NOT EDIT BELOW THIS LINE !!!
int main() {
    string s;
    if (cin >> s) {
        cout << (isValid(s) ? "true" : "false") << endl;
    }
    return 0;
}`
            },
            examples: [{
                input: '()[]{}',
                output: 'true',
                explanation: 'All brackets are properly matched and nested'
            }],
            test_cases: [
                { input: '()', expected_output: 'true' },
                { input: '()[]{}', expected_output: 'true' },
                { input: '(]', expected_output: 'false' }
            ],
            time_limit_seconds: 5, hints: ['Use a stack', 'Push opening brackets, pop for closing']
        },
        {
            id: 3, title: 'Longest Substring Without Repeating Characters', difficulty: 'hard',
            description: 'Given a string s, find the length of the longest substring without repeating characters.',
            skills_tested: ['sliding-window', 'hash-maps'],
            input_format: 'A string', output_format: 'An integer',
            sample_input: 'abcabcbb', sample_output: '3',
            starter_code: {
                python: `import sys

def lengthOfLongestSubstring(s):
    # Write your code here
    return 0

# !!! DO NOT EDIT BELOW THIS LINE !!!
if __name__ == '__main__':
    s = sys.stdin.read().strip()
    if s:
        print(lengthOfLongestSubstring(s))`,
                javascript: `
const fs = require('fs');

function lengthOfLongestSubstring(s) {
    // Write your code here
    return 0;
}

// !!! DO NOT EDIT BELOW THIS LINE !!!
try {
    const s = fs.readFileSync(0, 'utf-8').trim();
    if (s) {
        console.log(lengthOfLongestSubstring(s));
    }
} catch (e) {}`,
                java: `import java.util.*;

public class Main {
    public static int lengthOfLongestSubstring(String s) {
        // Write your code here
        return 0;
    }

    // !!! DO NOT EDIT BELOW THIS LINE !!!
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);
        if (scanner.hasNext()) {
            String s = scanner.next();
            System.out.println(lengthOfLongestSubstring(s));
        }
    }
}`,
                cpp: `#include <iostream>
#include <string>
#include <unordered_set>
#include <algorithm>

using namespace std;

int lengthOfLongestSubstring(string s) {
    // Write your code here
    return 0;
}

// !!! DO NOT EDIT BELOW THIS LINE !!!
int main() {
    string s;
    if (cin >> s) {
        cout << lengthOfLongestSubstring(s) << endl;
    }
    return 0;
}`
            },
            examples: [{
                input: 'abcabcbb',
                output: '3',
                explanation: 'The answer is "abc", the longest substring without repeating characters'
            }],
            test_cases: [
                { input: 'abcabcbb', expected_output: '3' },
                { input: 'bbbbb', expected_output: '1' },
                { input: 'pwwkew', expected_output: '3' }
            ],
            time_limit_seconds: 5, hints: ['Sliding window technique', 'Use a set to track characters']
        }
    ];

    // Filter by difficulty if specified
    let filtered = allProblems;
    if (difficultyLevel && difficultyLevel !== 'mixed') {
        filtered = allProblems.filter(p => p.difficulty === difficultyLevel);
        if (filtered.length === 0) filtered = allProblems; // fallback
    }
    // Return only requested number of problems


}

// ═══════════════════════════════════════════
//  SQL PROBLEM GENERATION
// ═══════════════════════════════════════════

async function generateSQLProblems(skills, count = 3, tableNames = null) {
    // Use test-specific table names if provided, otherwise fallback to defaults
    const tables = tableNames || {
        employees: 'employees',
        departments: 'departments',
        projects: 'projects',
        orders: 'orders'
    };

    const messages = [
        {
            role: 'system',
            content: `You are an expert SQL instructor. Generate SQL problems that can be tested against a sandbox database.

The sandbox database has these tables:
- ${tables.employees} (id INT, name TEXT, department TEXT, salary DECIMAL, hire_date DATE, manager_id INT)
- ${tables.departments} (id INT, name TEXT, budget DECIMAL, location TEXT)
- ${tables.projects} (id INT, name TEXT, department_id INT, start_date DATE, end_date DATE, status TEXT)
- ${tables.orders} (id INT, customer_name TEXT, product TEXT, quantity INT, price DECIMAL, order_date DATE)

IMPORTANT: Use EXACTLY these table names in your queries and descriptions: ${tables.employees}, ${tables.departments}, ${tables.projects}, ${tables.orders}

Return ONLY a valid JSON array. Each problem must have:
- "id": number
- "title": string
- "description": string (clear problem statement, include the exact table names students should use)
- "difficulty": "easy" | "medium" | "hard"
- "hint": string
- "expected_columns": array of strings (column names in result)
- "reference_query": string (the correct SQL query using the exact table names above)`
        },
        {
            role: 'user',
            content: `[Seed: ${getRandomSeed()}] Generate ${count} UNIQUE SQL problems with increasing difficulty.

IMPORTANT: Generate completely DIFFERENT problems every time. Avoid repeating common problems like "find employees above average salary" or "count by department".
Think of creative query scenarios involving: ${pickRandom(['joins', 'subqueries', 'window functions', 'aggregation', 'string functions', 'date functions', 'CASE statements', 'CTEs', 'self-joins', 'UNION', 'HAVING', 'nested queries'], 4).join(', ')}.

Remember: Use these EXACT table names: ${tables.employees}, ${tables.departments}, ${tables.projects}, ${tables.orders}

Return ONLY a valid JSON array.`
        }
    ];

    try {
        const response = await callCerebras(messages, { temperature: 0.9, max_tokens: 4000 });
        const problems = parseJSON(response);
        if (problems && Array.isArray(problems) && problems.length > 0) {
            return problems.slice(0, count);
        }
        return getDefaultSQLProblems(count, tables);
    } catch (err) {
        console.error('SQL generation failed:', err.message);
        return getDefaultSQLProblems(count, tables);
    }
}

function getDefaultSQLProblems(count = 3, tables = null) {
    const t = tables || {
        employees: 'employees',
        departments: 'departments',
        projects: 'projects',
        orders: 'orders'
    };

    const allProblems = [
        {
            id: 1, title: 'Employee Salary Report', difficulty: 'easy',
            description: `Find all employees in the ${t.employees} table who earn more than the average salary. Display their name, department, and salary. Order by salary descending.`,
            hint: 'Use a subquery with AVG() to calculate the average salary.',
            expected_columns: ['name', 'department', 'salary'],
            reference_query: `SELECT name, department, salary FROM ${t.employees} WHERE salary > (SELECT AVG(salary) FROM ${t.employees}) ORDER BY salary DESC`
        },
        {
            id: 2, title: 'Department Statistics', difficulty: 'medium',
            description: `Using the ${t.employees} table, show each department with the count of employees and average salary. Only include departments with more than 1 employee. Order by average salary descending.`,
            hint: 'Use GROUP BY with HAVING clause.',
            expected_columns: ['department', 'employee_count', 'avg_salary'],
            reference_query: `SELECT department, COUNT(*) as employee_count, ROUND(AVG(salary), 2) as avg_salary FROM ${t.employees} GROUP BY department HAVING COUNT(*) > 1 ORDER BY avg_salary DESC`
        },
        {
            id: 3, title: 'Top Revenue Products', difficulty: 'hard',
            description: `Using the ${t.orders} table, find the top 3 products by total revenue (quantity * price). Show product name, total quantity sold, and total revenue.`,
            hint: 'Use GROUP BY with aggregate functions and LIMIT.',
            expected_columns: ['product', 'total_quantity', 'total_revenue'],
            reference_query: `SELECT product, SUM(quantity) as total_quantity, SUM(quantity * price) as total_revenue FROM ${t.orders} GROUP BY product ORDER BY total_revenue DESC LIMIT 3`
        }
    ];
    return allProblems.slice(0, Math.min(count, allProblems.length));
}

// ═══════════════════════════════════════════
//  AI INTERVIEW QUESTION GENERATION
// ═══════════════════════════════════════════

async function generateInterviewQuestion(skills, previousQA, questionNumber, totalQuestions) {
    let prevContext = '';
    if (previousQA && previousQA.length > 0) {
        prevContext = previousQA.slice(-3).map((qa, i) =>
            `Q${i + 1}: ${qa.question}\nA${i + 1}: ${qa.answer || 'No answer'}\nScore: ${qa.score || 'N/A'}/10`
        ).join('\n');
    }

    const messages = [
        {
            role: 'system',
            content: `You are a senior technical interviewer conducting an AI-powered interview.
Ask one focused, insightful question at a time. Your questions should:
1. Start with fundamental concepts and progressively get harder
2. Be based on the candidate's actual skills
3. Include follow-up based on previous answers
4. Test both theoretical knowledge and practical experience

Return a JSON object with:
- "question": string (the interview question)
- "category": string (skill category being tested)
- "difficulty": "easy" | "medium" | "hard"
- "expected_key_points": array of strings (key points a good answer should cover)
- "follow_up_context": string (why this question was chosen)`
        },
        {
            role: 'user',
            content: `[Seed: ${getRandomSeed()}] Skills to test: ${skills.join(', ')}

Question ${questionNumber} of ${totalQuestions}.

Previous Q&A Context:
${prevContext || 'This is the first question.'}

Generate the next interview question. Make it progressively more challenging.
For early questions (1-3), ask foundational questions.
For middle questions (4-7), ask practical and project-based questions.
For later questions (8+), ask complex scenario-based questions.

IMPORTANT: Be creative. DO NOT ask generic questions like "What is X?" or "Explain Y". 
Instead, use scenario-based, problem-solving, or design questions.
Focus on: ${pickRandom(TOPIC_POOLS.concepts, 2).join(', ')}

Return ONLY valid JSON.`
        }
    ];

    try {
        const response = await callCerebras(messages, { temperature: 0.95, max_tokens: 2000 });
        const data = parseJSON(response);
        if (data && data.question) return data;
        return getFallbackQuestion(skills, questionNumber);
    } catch (err) {
        console.error('Interview question generation failed:', err.message);
        return getFallbackQuestion(skills, questionNumber);
    }
}

function getFallbackQuestion(skills, questionNumber) {
    const skill = skills[questionNumber % skills.length] || 'programming';
    return {
        question: `Can you explain your understanding of ${skill} and describe how you would use it in a real project?`,
        category: skill,
        difficulty: questionNumber <= 3 ? 'easy' : questionNumber <= 7 ? 'medium' : 'hard',
        expected_key_points: ['Technical depth', 'Practical experience', 'Problem-solving approach'],
        follow_up_context: 'Fallback question'
    };
}

// ═══════════════════════════════════════════
//  INTERVIEW ANSWER EVALUATION
// ═══════════════════════════════════════════

async function evaluateInterviewAnswer(question, answer, expectedKeyPoints, skillCategory) {
    const messages = [
        {
            role: 'system',
            content: `You are a technical interview evaluator. Evaluate the candidate's answer objectively.
Return a JSON object with:
- "score": number (0-10)
- "feedback": string (constructive feedback)
- "strengths": array of strings
- "weaknesses": array of strings
- "key_points_covered": array of strings (which expected points were addressed)
- "suggestion": string (what could be improved)`
        },
        {
            role: 'user',
            content: `Question: ${question}
Skill Category: ${skillCategory}

Expected Key Points: ${JSON.stringify(expectedKeyPoints)}

Candidate's Answer: ${answer}

Evaluate this answer. Be fair but thorough.
If the answer is empty or clearly irrelevant, give a low score.
Return ONLY valid JSON.`
        }
    ];

    try {
        const response = await callCerebras(messages, { temperature: 0.3, max_tokens: 2000 });
        const evaluation = parseJSON(response);
        if (evaluation && typeof evaluation.score === 'number') return evaluation;
        return { score: 5, feedback: 'Answer received. Unable to perform detailed evaluation.', strengths: [], weaknesses: [], key_points_covered: [], suggestion: 'Try to provide more detailed explanations.' };
    } catch (err) {
        console.error('Evaluation failed:', err.message);
        return { score: 5, feedback: 'Evaluation service temporarily unavailable.', strengths: [], weaknesses: [], key_points_covered: [], suggestion: 'Please try again.' };
    }
}

// ═══════════════════════════════════════════
//  FINAL REPORT GENERATION
// ═══════════════════════════════════════════

async function generateFinalReport(testTitle, skills, mcqResults, codingResults, sqlResults, interviewResults, proctoringViolations) {
    const messages = [
        {
            role: 'system',
            content: `You are an expert career coach and technical interviewer preparing a detailed placement report for a student.
The goal is to help the student improve for job placements. The report must be highly detailed, constructive, and actionable.

Return a JSON object with:
- "overall_rating": string ("Excellent" | "Good" | "Average" | "Below Average" | "Not Recommended")
- "summary": string (detailed executive summary of performance)
- "strengths": array of strings (detailed strengths with context)
- "weaknesses": array of strings (specific areas where they struggled)
- "skill_gap_analysis": array of objects with "skill", "current_level" (Beginner/Intermediate/Advanced), "target_level", and "gap_description"
- "roadmap": array of objects with "week" (1-4), "focus_area", and "action_items" (array of strings)
- "behavioral_analysis": string (analysis of communication and confidence if interview data is present)
- "performance_metrics": object with keys "accuracy", "speed", "completeness", "code_quality" and values 0-100
- "interview_feedback": array of objects (if interview data exists), each with:
    - "question_summary": string
    - "score": number (0-10)
    - "feedback": string (what they did well vs missed)
    - "improvement_tip": string (how to answer better next time)
- "concept_mastery": object with concept names as keys (e.g., "Loops", "Joins", "OOP") and values 0-100 (mastery percentage)`
        },
        {
            role: 'user',
            content: `Test: ${testTitle}
Skills Tested: ${JSON.stringify(skills)}

MCQ Results:
- Score: ${mcqResults.score}%
- Correct: ${mcqResults.correct}/${mcqResults.total}
- Passed: ${mcqResults.passed}
- Question Details: ${JSON.stringify(mcqResults.questionDetails || [])}

Coding Results:
- Score: ${codingResults.score}%
- Problems Solved: ${codingResults.solved}/${codingResults.total}
- Passed: ${codingResults.passed}
- Problem Details: ${JSON.stringify(codingResults.problemDetails || [])}

SQL Results:
- Score: ${sqlResults.score}%
- Problems Solved: ${sqlResults.solved}/${sqlResults.total}
- Passed: ${sqlResults.passed}
- Problem Details: ${JSON.stringify(sqlResults.problemDetails || [])}

AI Interview Results:
- Average Score: ${interviewResults.avgScore}/10
- Questions Answered: ${interviewResults.answered}/${interviewResults.total}
- Passed: ${interviewResults.passed}
- Key Q&A: ${JSON.stringify(interviewResults.highlights || [])}

Proctoring:
- Total Violations: ${proctoringViolations}

Generate a comprehensive, detailed report. Include:
1. Question-wise feedback for MCQ (which topics were wrong, why)
2. Problem-wise feedback for coding (approach, efficiency, code quality)
3. SQL query feedback (correctness, optimization)
4. Interview answer feedback (depth, communication, confidence)
5. Skill-wise assessment with specific scores per skill

Also include:
- "section_feedback": object with keys "mcq", "coding", "sql", "interview" — each a detailed string paragraph
- "mcq_question_analysis": array of objects with "question_summary", "correct", "skill", "feedback"
- "coding_problem_analysis": array of objects with "problem_title", "solved", "feedback", "improvement_tip"
- "sql_problem_analysis": array of objects with "problem_title", "solved", "feedback", "improvement_tip"
- "skill_wise_scores": object with skill names as keys and scores (0-100) as values

Return ONLY valid JSON.`
        }
    ];

    try {
        const response = await callCerebras(messages, { temperature: 0.5, max_tokens: 4000 });
        const report = parseJSON(response);
        if (report && report.overall_rating) return report;
        return getDefaultReport();
    } catch (err) {
        console.error('Report generation failed:', err.message);
        return getDefaultReport();
    }
}

function getDefaultReport() {
    return {
        overall_rating: 'Average',
        summary: 'Report generation encountered an issue. Please review individual test results for detailed information.',
        strengths: [],
        areas_for_improvement: [],
        skill_assessment: {},
        recommendation: 'Manual review recommended.',
        section_feedback: { mcq: 'N/A', coding: 'N/A', sql: 'N/A', interview: 'N/A' },
        concerns: [],
        suggested_focus_areas: []
    };
}

/**
 * Evaluate a student's SQL query against the problem using AI
 * This avoids running student queries on the real production database
 */
async function evaluateSQLQuery(problem, studentQuery) {
    const messages = [
        {
            role: 'system',
            content: `You are a pedagogical SQL evaluator and mentor. Your goal is to help a student identify errors in their SQL query WITHOUT revealing the reference solution or the correct query.
    
    CRITICAL RULES:
    1. NEVER include the reference query or the correct SQL syntax in your feedback.
    2. NEVER explicitly say "use HAVING..." or "use JOIN...". Instead, say "Check your filtering conditions for groups" or "Ensure you are correctly combining tables".
    3. Describe the logical mismatch. (e.g., "Your query returns employees who work in 'HR', but the problem asks for those who do NOT.")
    4. If the student made a simple typo, point to the area rather than giving the fix.
    5. Always focus on why the result set would be different (rows missing, extra rows, wrong data).
    
    Evaluation Criteria:
    - passed: true/false (Functionally equivalent to reference)
    - feedback: Constructive, mentor-like feedback that guides the student.
    - score: 0-100 based on how close they are.
    
    Return ONLY a valid JSON object with:
    - "passed": boolean
    - "feedback": string
    - "score": number`
        },
        {
            role: 'user',
            content: `Problem: ${problem.title || ''}
Description: ${problem.description || ''}
Expected columns: ${JSON.stringify(problem.expected_columns || [])}
Reference query: ${problem.reference_query || 'Not available'}

Student's query: ${studentQuery}

Evaluate if the student's query is correct. Return ONLY valid JSON.`
        }
    ];

    try {
        const response = await callCerebras(messages, { temperature: 0.2, max_tokens: 1500 });
        const evaluation = parseJSON(response);
        if (evaluation && typeof evaluation.passed === 'boolean') return evaluation;
        return { passed: false, feedback: 'Unable to evaluate query. Please try again.', score: 0 };
    } catch (err) {
        console.error('SQL evaluation failed:', err.message);
        return { passed: false, feedback: 'Evaluation service temporarily unavailable.', score: 0 };
    }
}

module.exports = {
    generateMCQQuestions,
    generateCodingProblems,
    generateFallbackCoding,
    generateSQLProblems,
    generateInterviewQuestion,
    evaluateInterviewAnswer,
    evaluateSQLQuery,
    generateFinalReport
};
