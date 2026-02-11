// utils/pagination.js
// Copy this file into your utils folder

/**
 * Extract pagination parameters from query string
 * @param {object} query - Request query parameters
 * @param {number} defaultLimit - Default items per page (default: 20)
 * @param {number} maxLimit - Maximum items per page (default: 100)
 * @returns {object} {page, limit, offset}
 */
function getPaginationParams(query, defaultLimit = 20, maxLimit = 100) {
    const page = Math.max(1, parseInt(query.page) || 1);
    const limit = Math.min(maxLimit, parseInt(query.limit) || defaultLimit);
    const offset = (page - 1) * limit;

    return { page, limit, offset };
}

/**
 * Get paginated data from database or SIMPLY format response
 * @param {object} dataOrQuery - Either the data to paginate OR request query parameters
 * @param {object} poolOrTotal - Either pool connection OR total count (when using simple format)
 * @param {string} countQuery - SQL query to count total items (omit for simple format)
 * @param {array} countParams - Parameters for count query (omit for simple format)
 * @param {string} dataQuery - SQL query to fetch paginated data (omit for simple format)
 * @param {array} dataParams - Parameters for data query (omit for simple format)
 * @param {number} defaultLimit - Default items per page
 * @returns {object} {data, pagination}
 */
async function paginatedResponse(
    dataOrQuery,
    poolOrTotalOrPage,
    countQuery,
    countParams,
    dataQuery,
    dataParams,
    defaultLimit = 20
) {
    // Check if using simple format: paginatedResponse({ data, total, page, limit })
    if (dataOrQuery && 
        dataOrQuery.data !== undefined && 
        dataOrQuery.total !== undefined &&
        (!poolOrTotalOrPage || (typeof poolOrTotalOrPage === 'object' && !poolOrTotalOrPage.query))) {
        // Simple format
        const { data, total, page = 1, limit = 20 } = dataOrQuery;
        const totalPages = Math.ceil(total / limit);
        
        return {
            data,
            pagination: {
                page,
                limit,
                total,
                pages: totalPages,
                hasNextPage: page < totalPages,
                hasPreviousPage: page > 1
            }
        };
    }

    // Complex format: paginatedResponse(query, pool, countQuery, ...)
    const query = dataOrQuery;
    const pool = poolOrTotalOrPage;
    const { page, limit, offset } = getPaginationParams(query, defaultLimit);

    // Get total count
    const [countResult] = await pool.query(countQuery, countParams);
    const total = countResult[0].count;

    // Get paginated data
    const [data] = await pool.query(
        dataQuery + ' LIMIT ? OFFSET ?',
        [...dataParams, limit, offset]
    );

    const totalPages = Math.ceil(total / limit);

    return {
        data,
        pagination: {
            page,
            limit,
            total,
            pages: totalPages,
            hasNextPage: page < totalPages,
            hasPreviousPage: page > 1
        }
    };
}

/**
 * Get paginated data from database
 * @param {object} query - Request query parameters
 * @param {object} pool - MySQL pool connection
 * @param {string} countQuery - SQL query to count total items
 * @param {array} countParams - Parameters for count query
 * @param {string} dataQuery - SQL query to fetch paginated data
 * @param {array} dataParams - Parameters for data query
 * @param {number} defaultLimit - Default items per page
 * @returns {object} {data, pagination}
 */
async function paginatedResponseOld(
    query,
    pool,
    countQuery,
    countParams,
    dataQuery,
    dataParams,
    defaultLimit = 20
) {
    const { page, limit, offset } = getPaginationParams(query, defaultLimit);

    // Get total count
    const [countResult] = await pool.query(countQuery, countParams);
    const total = countResult[0].count;

    // Get paginated data
    const [data] = await pool.query(
        dataQuery + ' LIMIT ? OFFSET ?',
        [...dataParams, limit, offset]
    );

    const totalPages = Math.ceil(total / limit);

    return {
        data,
        pagination: {
            page,
            limit,
            total,
            pages: totalPages,
            hasNextPage: page < totalPages,
            hasPreviousPage: page > 1
        }
    };
}

module.exports = { getPaginationParams, paginatedResponse };
