FROM cfn-cc-poc-repo-base:release as installer
WORKDIR /app
COPY . /app/

RUN sudo chown -R verisim:verisim /app
RUN sudo -u verisim /opt/conda/envs/vsl3.8/bin/pip install -r /app/requirements.txt


FROM installer as test
RUN sudo -u verisim chmod 777 reports
RUN sudo -u verisim /opt/conda/envs/vsl3.8/bin/python -m pytest -q --junitxml=reports/unittest.xml

# ENTRYPOINT [ "/bin/bash", "-l", "-c" ]

FROM installer as main
WORKDIR /app
COPY . /app/

RUN sudo chown -R verisim:verisim /app
RUN sudo -u verisim /opt/conda/envs/vsl3.8/bin/pip install -r /app/requirements.txt
ENTRYPOINT ["/opt/conda/envs/vsl3.8/bin/python", "manage.py", "runserver", "0.0.0.0:8001"]
