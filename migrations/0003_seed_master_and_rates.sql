-- Seed the approved nominal role only when the employee table is completely empty.
-- Never merge into or overwrite a non-empty employee register.
-- Existing living status values are preserved; newly seeded personnel start as UNSET
-- so nobody is accidentally treated as IN Living before an administrator confirms it.

-- Migration 0001 defines living_status with IN, OUT, and UNSET support.
-- Avoid dropping/rebuilding the column here so existing employee-linked records remain untouched.



WITH seed(force_no, rank, name) AS (
  VALUES
  ('SF-815', 'DD', 'Ghulam Rasool Anjum'),
  ('SF-1353', 'AD', 'Abid Ali'),
  ('SF-1519', 'AD', 'Abdul Hanan Dero'),
  ('US-5500', 'INSP', 'Waseem Shehzad'),
  ('US-6006', 'INSP', 'Saifoor Rehman'),
  ('US-5753', 'INSP', 'M Dawood'),
  ('US-6710', 'SI', 'Hazrat Usman'),
  ('US-6923', 'SI', 'Safder Ali'),
  ('US-7026', 'SI', 'Nisar Ahmed'),
  ('US-7053', 'SI', 'Altaf Hussain'),
  ('US-7555', 'SI', 'M Saleem'),
  ('US-7664', 'SI', 'Ashiq Ali'),
  ('US-9041', 'SI', 'Naveed Baloch'),
  ('US-9101', 'SI', 'Allah Ditta Masih'),
  ('US-10427', 'ASI', 'M Sajid'),
  ('US-10481', 'ASI', 'M Sabir'),
  ('US-11101', 'ASI', 'Sajid Ali'),
  ('US-11112', 'ASI', 'Ali Zia'),
  ('US-11398', 'ASI', 'Ahmed Ali'),
  ('US-11472', 'ASI', 'Zaheer Ahmed'),
  ('US-11483', 'ASI', 'Shahid Saeed'),
  ('US-11515', 'ASI', 'M Shehbaz Khan'),
  ('US-11955', 'ASI', 'M Asif Khan'),
  ('US-12388', 'ASI', 'Abid Ali'),
  ('S-12322', 'SGT', 'Shoaib Anwar'),
  ('S-12824', 'SGT', 'M Saeed Akhtar'),
  ('S-13619', 'SGT', 'M Asif'),
  ('S-13698', 'SGT', 'Hafeez Ullah'),
  ('S-14204', 'SGT', 'Khalid Hussain'),
  ('S-14398', 'SGT', 'Shehzad Yaqoob'),
  ('S-15494', 'SGT', 'Nadeem Abbas'),
  ('S-15689', 'SGT', 'Shahid Rafique'),
  ('S-15670', 'SGT', 'M Nabeel'),
  ('C-15761', 'CPL', 'Shehbaz Mumtaz'),
  ('C-15843', 'CPL', 'M Rehman'),
  ('C-16231', 'CPL', 'Umar Niaz'),
  ('C-16324', 'CPL', 'Tariq Zaman'),
  ('C-16556', 'CPL', 'Nouman Shakeel'),
  ('C-16566', 'CPL', 'Khalil Khan'),
  ('C-16654', 'CPL', 'Shoukat Ali'),
  ('C-17200', 'CPL', 'Muzammil Abbas'),
  ('C-17459', 'CPL', 'M Irfan'),
  ('C-17723', 'CPL', 'M Haroon'),
  ('C-18311', 'CPL', 'Abdul Haseeb'),
  ('C-18854', 'CPL', 'M Shakir'),
  ('C-19289', 'CPL', 'Waseem Masih'),
  ('C-19339', 'CPL', 'Haseeb Ahmed'),
  ('C-19428', 'CPL', 'Awais Yaqoob'),
  ('C-19448', 'CPL', 'M Imdad'),
  ('C-19823', 'CPL', 'Zaheer Ud Din Babar'),
  ('C-20028', 'CPL', 'Amanat Ali'),
  ('C-20669', 'CPL', 'Tahir Mehmood'),
  ('C-21409', 'CPL', 'Hussain Ahmed'),
  ('C-21857', 'CPL', 'Mudassir Sharif'),
  ('C-22015', 'CPL', 'Miraj Ali'),
  ('C-22008', 'CPL', 'Hunain Rehman'),
  ('C-22248', 'CPL', 'Pervaiz Ali'),
  ('C-22126', 'CPL', 'Hussain Ali'),
  ('C-22211', 'CPL', 'M Ali'),
  ('C-21778', 'CPL', 'M Junaid'),
  ('C-22024', 'CPL', 'Sibtain Hassan')
)
INSERT INTO employees (id, force_no, rank, name, living_status, driving_license, active)
SELECT lower(hex(randomblob(16))), seed.force_no, seed.rank, seed.name, 'UNSET', 'No', 1
FROM seed
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
