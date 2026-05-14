import mongoose from 'mongoose';
import { DATE_STRING_REGEX, MASTER_KIND_SET } from '../config/constants.js';

export const isValidObjectId = (value) => mongoose.isValidObjectId(value);

export const asObjectIdOrNull = (value) => 
  value && isValidObjectId(value) ? value : null;

export const isValidDateString = (value) => 
  DATE_STRING_REGEX.test(String(value || ''));

export const isValidMasterKind = (value) => 
  MASTER_KIND_SET.has(value);
