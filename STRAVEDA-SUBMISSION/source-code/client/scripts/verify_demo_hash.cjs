const bcrypt = require('bcryptjs');
const hash = '$2y$10$Ax.FbnMcx7R2HW8RLGNtsuJsUC13LgebaKm.6vsAnp/D.RKkX9mpO';
if (!bcrypt.compareSync('Demo@12345', hash.replace(/^\$2y\$/, '$2a$'))) throw new Error('Demo password does not verify');
if (bcrypt.compareSync('wrong-password', hash.replace(/^\$2y\$/, '$2a$'))) throw new Error('Wrong password verified');
console.log('Demo bcrypt hash verification passed');
