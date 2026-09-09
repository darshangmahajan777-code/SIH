// Global error handling middleware
export const errorHandler = (err, req, res, next) => {
  const isProduction = process.env.NODE_ENV === 'production';
  const isOperational = Boolean(err.isOperational);

  const statusCode = err.statusCode || 500;
  let clientMessage = err.message || 'Internal Server Error';

  // In production, mask internal server / DB exceptions to prevent information disclosure
  if (isProduction && statusCode === 500 && !isOperational) {
    clientMessage = 'An unexpected internal server error occurred. Please contact support.';
  }

  console.error(`[Error] ${req.method} ${req.originalUrl} - ${statusCode}: ${err.message}`);
  if (!isProduction && err.stack) {
    console.error(err.stack);
  }

  res.status(statusCode).json({
    success: false,
    error: clientMessage,
    ...(!isProduction && { stack: err.stack }),
  });
};

// Custom error class
export class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.status = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Async handler wrapper — eliminates try-catch in every route
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Not found handler
export const notFoundHandler = (req, res, next) => {
  const err = new AppError(`Route not found: ${req.originalUrl}`, 404);
  next(err);
};
