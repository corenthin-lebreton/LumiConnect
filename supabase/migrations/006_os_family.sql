-- Les scripts sont désormais rangés par famille (windows / linux) et non plus par distribution.
UPDATE formations SET os_id = CASE
  WHEN os_id = 'win11' THEN 'windows'
  WHEN os_id IN ('debian13', 'ubuntu2404', 'kali') THEN 'linux'
  ELSE os_id
END;
