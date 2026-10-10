-- Seed the approved nominal role only when the employee table is completely empty.
-- Never merge into or overwrite a non-empty employee register.
-- Existing living status values are preserved; newly seeded personnel start as UNSET
-- so nobody is accidentally treated as IN Living before an administrator confirms it.

DROP INDEX IF EXISTS idx_employees_living_status;
ALTER TABLE employees ADD COLUMN living_status_new TEXT NOT NULL DEFAULT 'UNSET'
  CHECK (living_status_new IN ('IN', 'OUT', 'UNSET'));
UPDATE employees SET living_status_new = living_status;
ALTER TABLE employees DROP COLUMN living_status;
ALTER TABLE employees RENAME COLUMN living_status_new TO living_status;
CREATE INDEX IF NOT EXISTS idx_employees_living_status ON employees(living_status);

INSERT INTO employees (id, force_no, rank, name, living_status, driving_license, active)
SELECT lower(hex(randomblob(16))), seed.force_no, seed.rank, seed.name, 'UNSET', 'No', 1
FROM (
  SELECT 'SF-815' AS force_no, 'DD' AS rank, 'Ghulam Rasool Anjum' AS name
  UNION ALL SELECT 'SF-1353','AD','Abid Ali'
  UNION ALL SELECT 'SF-1519','AD','Abdul Hanan Dero'
  UNION ALL SELECT 'US-5500','INSP','Waseem Shehzad'
  UNION ALL SELECT 'US-6006','INSP','Saifoor Rehman'
  UNION ALL SELECT 'US-5753','INSP','M Dawood'
  UNION ALL SELECT 'US-6710','SI','Hazrat Usman'
  UNION ALL SELECT 'US-6923','SI','Safder Ali'
  UNION ALL SELECT 'US-7026','SI','Nisar Ahmed'
  UNION ALL SELECT 'US-7053','SI','Altaf Hussain'
  UNION ALL SELECT 'US-7555','SI','M Saleem'
  UNION ALL SELECT 'US-7664','SI','Ashiq Ali'
  UNION ALL SELECT 'US-9041','SI','Naveed Baloch'
  UNION ALL SELECT 'US-9101','SI','Allah Ditta Masih'
  UNION ALL SELECT 'US-10427','ASI','M Sajid'
  UNION ALL SELECT 'US-10481','ASI','M Sabir'
  UNION ALL SELECT 'US-11101','ASI','Sajid Ali'
  UNION ALL SELECT 'US-11112','ASI','Ali Zia'
  UNION ALL SELECT 'US-11398','ASI','Ahmed Ali'
  UNION ALL SELECT 'US-11472','ASI','Zaheer Ahmed'
  UNION ALL SELECT 'US-11483','ASI','Shahid Saeed'
  UNION ALL SELECT 'US-11515','ASI','M Shehbaz Khan'
  UNION ALL SELECT 'US-11955','ASI','M Asif Khan'
  UNION ALL SELECT 'US-12388','ASI','Abid Ali'
  UNION ALL SELECT 'S-12322','SGT','Shoaib Anwar'
  UNION ALL SELECT 'S-12824','SGT','M Saeed Akhtar'
  UNION ALL SELECT 'S-13619','SGT','M Asif'
  UNION ALL SELECT 'S-13698','SGT','Hafeez Ullah'
  UNION ALL SELECT 'S-14204','SGT','Khalid Hussain'
  UNION ALL SELECT 'S-14398','SGT','Shehzad Yaqoob'
  UNION ALL SELECT 'S-15494','SGT','Nadeem Abbas'
  UNION ALL SELECT 'S-15689','SGT','Shahid Rafique'
  UNION ALL SELECT 'S-15670','SGT','M Nabeel'
  UNION ALL SELECT 'C-15761','CPL','Shehbaz Mumtaz'
  UNION ALL SELECT 'C-15843','CPL','M Rehman'
  UNION ALL SELECT 'C-16231','CPL','Umar Niaz'
  UNION ALL SELECT 'C-16324','CPL','Tariq Zaman'
  UNION ALL SELECT 'C-16556','CPL','Nouman Shakeel'
  UNION ALL SELECT 'C-16566','CPL','Khalil Khan'
  UNION ALL SELECT 'C-16654','CPL','Shoukat Ali'
  UNION ALL SELECT 'C-17200','CPL','Muzammil Abbas'
  UNION ALL SELECT 'C-17459','CPL','M Irfan'
  UNION ALL SELECT 'C-17723','CPL','M Haroon'
  UNION ALL SELECT 'C-18311','CPL','Abdul Haseeb'
  UNION ALL SELECT 'C-18854','CPL','M Shakir'
  UNION ALL SELECT 'C-19289','CPL','Waseem Masih'
  UNION ALL SELECT 'C-19339','CPL','Haseeb Ahmed'
  UNION ALL SELECT 'C-19428','CPL','Awais Yaqoob'
  UNION ALL SELECT 'C-19448','CPL','M Imdad'
  UNION ALL SELECT 'C-19823','CPL','Zaheer Ud Din Babar'
  UNION ALL SELECT 'C-20028','CPL','Amanat Ali'
  UNION ALL SELECT 'C-20669','CPL','Tahir Mehmood'
  UNION ALL SELECT 'C-21409','CPL','Hussain Ahmed'
  UNION ALL SELECT 'C-21857','CPL','Mudassir Sharif'
  UNION ALL SELECT 'C-22015','CPL','Miraj Ali'
  UNION ALL SELECT 'C-22008','CPL','Hunain Rehman'
  UNION ALL SELECT 'C-22248','CPL','Pervaiz Ali'
  UNION ALL SELECT 'C-22126','CPL','Hussain Ali'
  UNION ALL SELECT 'C-22211','CPL','M Ali'
  UNION ALL SELECT 'C-21778','CPL','M Junaid'
  UNION ALL SELECT 'C-22024','CPL','Sibtain Hassan'
) AS seed
WHERE (SELECT COUNT(*) FROM employees) = 0;

-- September 2026 contribution rates from the supplied monthly contribution report.
-- Each rate is inserted only if that exact rank/status/effective date is not already set.
INSERT INTO contribution_rates
  (id, rank, living_status, effective_from, welfare, mod_amount, med, barber, waiter, wman)
SELECT lower(hex(randomblob(16))), seed.rank, seed.living_status, '2026-09-01',
       seed.welfare, seed.mod_amount, seed.med, seed.barber, seed.waiter, seed.wman
FROM (
  SELECT 'DD' AS rank, 'IN' AS living_status, 600 AS welfare, 600 AS mod_amount, 200 AS med, 0 AS barber, 0 AS waiter, 0 AS wman
  UNION ALL SELECT 'DD','OUT',600,600,200,0,0,0
  UNION ALL SELECT 'AD','IN',500,500,180,0,0,700
  UNION ALL SELECT 'AD','OUT',500,500,180,0,0,0
  UNION ALL SELECT 'INSP','IN',300,300,150,0,0,650
  UNION ALL SELECT 'INSP','OUT',300,300,150,0,0,0
  UNION ALL SELECT 'SI','IN',220,220,120,320,200,480
  UNION ALL SELECT 'SI','OUT',220,220,120,320,0,0
  UNION ALL SELECT 'ASI','IN',200,200,100,300,200,430
  UNION ALL SELECT 'ASI','OUT',200,200,100,300,0,0
  UNION ALL SELECT 'SGT','IN',175,175,80,250,200,350
  UNION ALL SELECT 'SGT','OUT',175,175,80,250,0,0
  UNION ALL SELECT 'CPL','IN',150,150,80,230,200,330
  UNION ALL SELECT 'CPL','OUT',150,150,80,230,0,0
) AS seed
WHERE NOT EXISTS (
  SELECT 1 FROM contribution_rates existing
  WHERE existing.rank = seed.rank
    AND existing.living_status = seed.living_status
    AND existing.effective_from = '2026-09-01'
);
