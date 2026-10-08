'use strict';

const VALID_STATUS = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
const VALID_PRIORITY = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const VALID_CATEGORY = ['GENERAL', 'BILLING', 'TECHNICAL', 'ACCOUNT', 'OTHER'];

function bad(msg) {
  const e = new Error(msg);
  e.statusCode = 400;
  return e;
}

function validateCreateTicket(body) {
  if (!body.title || typeof body.title !== 'string' || body.title.trim().length < 3) {
    throw bad('title is required (min 3 chars)');
  }
  if (!body.description || typeof body.description !== 'string' || body.description.trim().length < 5) {
    throw bad('description is required (min 5 chars)');
  }
  if (body.priority && !VALID_PRIORITY.includes(body.priority)) {
    throw bad(`priority must be one of ${VALID_PRIORITY.join(', ')}`);
  }
  if (body.category && !VALID_CATEGORY.includes(body.category)) {
    throw bad(`category must be one of ${VALID_CATEGORY.join(', ')}`);
  }
  if (body.attachments && !Array.isArray(body.attachments)) {
    throw bad('attachments must be an array');
  }
}

function validateUpdateTicket(body) {
  const allowed = ['status', 'assignee', 'priority', 'title', 'description', 'category'];
  const keys = Object.keys(body).filter((k) => allowed.includes(k));
  if (keys.length === 0) throw bad(`Nothing to update. Allowed: ${allowed.join(', ')}`);
  if (body.status && !VALID_STATUS.includes(body.status)) {
    throw bad(`status must be one of ${VALID_STATUS.join(', ')}`);
  }
  if (body.priority && !VALID_PRIORITY.includes(body.priority)) {
    throw bad(`priority must be one of ${VALID_PRIORITY.join(', ')}`);
  }
  if (body.category && !VALID_CATEGORY.includes(body.category)) {
    throw bad(`category must be one of ${VALID_CATEGORY.join(', ')}`);
  }
}

function validateComment(body) {
  if (!body.message || typeof body.message !== 'string' || body.message.trim().length < 1) {
    throw bad('message is required');
  }
  if (body.message.length > 5000) throw bad('message too long (max 5000 chars)');
}

function validatePresigned(body) {
  if (!body.fileName || typeof body.fileName !== 'string') throw bad('fileName is required');
  if (!body.contentType || typeof body.contentType !== 'string') throw bad('contentType is required');
}

module.exports = { VALID_STATUS, VALID_PRIORITY, VALID_CATEGORY, validateCreateTicket, validateUpdateTicket, validateComment, validatePresigned };
